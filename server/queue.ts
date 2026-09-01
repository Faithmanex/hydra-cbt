import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { answerQuestion, parseAnswerLetter, parseUnreadableReason } from "./ai";

function getDataPath(): string | null {
  if (process.env.VERCEL) return null;
  const candidates = [
    path.resolve(__dirname, "jobs.json"),
    path.resolve(__dirname, "..", "server", "jobs.json"),
    path.resolve(process.cwd(), "server", "jobs.json"),
    path.resolve(process.cwd(), "jobs.json"),
  ];
  // Use first writable candidate's directory
  for (const p of candidates) {
    try {
      const dir = path.dirname(p);
      if (fs.existsSync(dir)) return p;
    } catch {}
  }
  return candidates[0];
}

function loadFromDisk(): { jobs: Job[]; maxSeq: number } | null {
  const p = getDataPath();
  if (!p) return null;
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data?.jobs)) {
      return { jobs: data.jobs as Job[], maxSeq: Number(data.maxSeq) || 0 };
    }
  } catch {}
  return null;
}

function saveToDisk(jobs: Job[], maxSeq: number) {
  const p = getDataPath();
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ jobs, maxSeq }, null, 2), "utf-8");
  } catch {}
}

export type JobStatus = "queued" | "processing" | "done" | "error" | "unreadable";

export interface Job {
  id: string;
  seq: number;
  status: JobStatus;
  error?: string;
  answer?: string;
  answerLetter?: string;
  imageBase64: string;
  mimeType: string;
  createdAt: number;
  processedAt?: number;
}

export type PublicJob = Omit<Job, "imageBase64">;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class JobQueue {
  private jobs: Job[] = [];
  private pumping = false;
  private maxSeq = 0;

  constructor() {
    const loaded = loadFromDisk();
    if (loaded) {
      this.jobs = loaded.jobs;
      this.maxSeq = loaded.maxSeq;
      // Reset any stuck processing jobs to queued on restart
      for (const j of this.jobs) {
        if (j.status === "processing") j.status = "queued";
      }
      if (this.jobs.length) {
        console.log(`[queue] Restored ${this.jobs.length} jobs from disk (maxSeq ${this.maxSeq})`);
        // Resume processing
        setTimeout(() => void this.pump(), 500);
      }
    }
  }

  private persist() {
    saveToDisk(this.jobs, this.maxSeq);
  }

  add(imageBase64: string, mimeType: string, seq: number): PublicJob {
    if (this.jobs.some((j) => j.seq === seq)) {
      seq = this.maxSeq + 1;
    }
    if (seq > this.maxSeq) this.maxSeq = seq;
    const job: Job = {
      id: randomUUID(),
      seq,
      status: "queued",
      imageBase64,
      mimeType,
      createdAt: Date.now(),
    };
    this.jobs.push(job);
    this.persist();
    void this.pump();
    return this.toPublic(job);
  }

  list(): PublicJob[] {
    return [...this.jobs]
      .sort((a, b) => a.seq - b.seq)
      .map((j) => this.toPublic(j));
  }

  remove(id: string): boolean {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || job.status === "processing") return false;
    this.jobs = this.jobs.filter((j) => j.id !== id);
    this.persist();
    return true;
  }

  clearAll(): void {
    // Don't delete processing jobs to avoid race
    this.jobs = this.jobs.filter((j) => j.status === "processing");
    this.maxSeq = this.jobs.reduce((m, j) => Math.max(m, j.seq), 0);
    this.persist();
  }

  retry(id: string): PublicJob | null {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || job.status !== "error") return null;
    job.status = "queued";
    job.error = undefined;
    job.processedAt = undefined;
    this.persist();
    void this.pump();
    return this.toPublic(job);
  }

  resnap(id: string, imageBase64: string, mimeType: string): PublicJob | null {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || job.status === "processing") return null;
    job.imageBase64 = imageBase64;
    job.mimeType = mimeType;
    job.status = "queued";
    job.error = undefined;
    job.answer = undefined;
    job.answerLetter = undefined;
    job.processedAt = undefined;
    this.persist();
    void this.pump();
    return this.toPublic(job);
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      // FIFO by snap order: the lowest sequence number goes first, one at a time.
      while (true) {
        const job = this.jobs
          .filter((j) => j.status === "queued")
          .sort((a, b) => a.seq - b.seq)[0];
        if (!job) break;

        job.status = "processing";
        this.persist();
        try {
          const answer = await answerQuestion(job.imageBase64, job.mimeType);
          const reason = parseUnreadableReason(answer);
          if (reason) {
            job.answer = reason;
            job.status = "unreadable";
          } else {
            job.answer = answer;
            job.answerLetter = parseAnswerLetter(answer);
            job.status = "done";
          }
        } catch (err) {
          job.error = err instanceof Error ? err.message : String(err);
          job.status = "error";
        }
        job.processedAt = Date.now();
        this.persist();
        // Per-key RPM is handled in ai.ts (auto-rotate), so no global cooldown here
        if (this.jobs.some((j) => j.status === "queued")) {
          await sleep(10);
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  private toPublic(job: Job): PublicJob {
    const { imageBase64: _omit, ...rest } = job;
    return rest;
  }
}
