import { useCallback, useEffect, useRef, useState } from "react";
import { AnswersPanel } from "./AnswersPanel";
import { Camera, type CaptureResult } from "./Camera";
import { JobQueue } from "./JobQueue";
import { Lightbox } from "./Lightbox";
import { deleteJob, getJobs, postJob, resnapJob, retryJob } from "./api";
import type { Job } from "./types";
import "./App.css";

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [resnapId, setResnapId] = useState<string | null>(null);
  const jobsRef = useRef<Job[]>([]);
  const seqRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const list = await getJobs();
      jobsRef.current = list;
      setJobs(list);
      const maxSeq = list.reduce((m, j) => Math.max(m, j.seq), 0);
      if (maxSeq > seqRef.current) seqRef.current = maxSeq;
    } catch {
      setBanner("Cannot reach the server — is `npm run dev` running?");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(id);
  }, [refresh]);

  const handleCapture = useCallback((shot: CaptureResult) => {
    seqRef.current += 1;
    const seq = seqRef.current;
    const base64 = shot.dataUrl.slice(shot.dataUrl.indexOf(",") + 1);
    const mimeType = shot.dataUrl.slice(5, shot.dataUrl.indexOf(";"));
    void postJob(base64, mimeType, seq)
      .then((job) => {
        setThumbs((t) => ({ ...t, [job.id]: shot.dataUrl }));
        const next = [...jobsRef.current, job];
        jobsRef.current = next;
        setJobs(next);
        setBanner(null);
      })
      .catch(() => setBanner("Upload failed — check the connection and snap again."));
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      void deleteJob(id)
        .then(refresh)
        .catch(() => setBanner("Could not remove that item."));
    },
    [refresh]
  );

  const handleRetry = useCallback(
    (id: string) => {
      void retryJob(id)
        .then(refresh)
        .catch(() => setBanner("Could not retry that item."));
    },
    [refresh]
  );

  const handleResnapShot = useCallback(
    (shot: CaptureResult) => {
      const id = resnapId;
      if (!id) return;
      const base64 = shot.dataUrl.slice(shot.dataUrl.indexOf(",") + 1);
      const mimeType = shot.dataUrl.slice(5, shot.dataUrl.indexOf(";"));
      void resnapJob(id, base64, mimeType)
        .then((job) => {
          setThumbs((t) => ({ ...t, [id]: shot.dataUrl }));
          setResnapId(null);
          setBanner(null);
          void refresh();
        })
        .catch(() => setBanner("Could not re-snap that question."));
    },
    [resnapId, refresh]
  );

  const resnapJobObj = jobs.find((j) => j.id === resnapId) ?? null;

  const previewJob = jobs.find((j) => j.id === previewId) ?? null;
  const previewSrc = previewJob ? thumbs[previewJob.id] : undefined;

  const doneCount = jobs.filter((j) => j.status === "done").length;
  const pendingCount = jobs.filter(
    (j) => j.status === "queued" || j.status === "processing"
  ).length;
  const attentionCount = jobs.filter(
    (j) => j.status === "error" || j.status === "unreadable"
  ).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#04121c">
              <path d="M9 3L7.2 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2.2L15 3H9zm3 14a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
            </svg>
          </div>
          <div>
            <h1>Hydra CBT</h1>
            <p>Snap questions. Get answers. Keep snapping.</p>
          </div>
        </div>
        <div className="stats">
          <span className="stat-chip">
            <span className="dot dot-done" />
            <b>{doneCount}</b> answered
          </span>
          <span className="stat-chip">
            <span className="dot dot-processing" />
            <b>{pendingCount}</b> reading
          </span>
          <span className="stat-chip">
            <span className="dot dot-error" />
            <b>{attentionCount}</b> need attention
          </span>
          <span className="stat-chip">
            <b>{jobs.length}</b> snapped
          </span>
        </div>
      </header>
      {banner && (
        <div className="banner">
          {banner}
          <button className="btn btn-close" onClick={() => setBanner(null)}>
            &times;
          </button>
        </div>
      )}
      <main className="layout">
        <section className="left-col">
          <Camera
            onCapture={handleCapture}
            onResnap={handleResnapShot}
            onCancelResnap={() => setResnapId(null)}
            resnapLabel={
              resnapJobObj ? `Re-snapping Question ${resnapJobObj.seq}` : null
            }
          />
          <JobQueue
            jobs={jobs}
            thumbs={thumbs}
            onDelete={handleDelete}
            onPreview={setPreviewId}
          />
        </section>
        <AnswersPanel
          jobs={jobs}
          thumbs={thumbs}
          onRetry={handleRetry}
          onPreview={setPreviewId}
          onResnap={setResnapId}
        />
      </main>
      <footer className="app-footer">
        <span>
          <kbd>Space</kbd> to snap
        </span>
        <span>Click a thumbnail to preview the full question</span>
        <span>Answers appear in snap order</span>
      </footer>
      {previewJob && previewSrc && (
        <Lightbox
          src={previewSrc}
          title={`Question ${previewJob.seq}`}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}
