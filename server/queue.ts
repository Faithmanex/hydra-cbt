import { randomUUID } from "crypto";
import { answerQuestion, parseAnswerLetter, parseUnreadableReason } from "./ai";

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

const RPM = Number(process.env.GEMINI_RPM ?? 10);
const COOLDOWN_MS = Math.max(1, Math.round(60000 / RPM));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class JobQueue {
  private jobs: Job[] = [];
  private pumping = false;
  private maxSeq = 0;

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
    return true;
  }

  retry(id: string): PublicJob | null {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || job.status !== "error") return null;
    job.status = "queued";
    job.error = undefined;
    job.processedAt = undefined;
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
        if (this.jobs.some((j) => j.status === "queued")) {
          await sleep(COOLDOWN_MS);
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
