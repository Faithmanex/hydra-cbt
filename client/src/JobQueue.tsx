import type { Job } from "./types";

const STATUS_LABEL: Record<Job["status"], string> = {
  queued: "waiting",
  processing: "reading",
  done: "done",
  error: "error",
  unreadable: "unreadable",
};

interface Props {
  jobs: Job[];
  thumbs: Record<string, string>;
  onDelete: (id: string) => void;
  onPreview: (id: string) => void;
}

export function JobQueue({ jobs, thumbs, onDelete, onPreview }: Props) {
  return (
    <div className="strip-wrap">
      <div className="strip-label">
        <span>Snapped questions</span>
        <span className="strip-count">{jobs.length}</span>
      </div>
      <div className="strip">
        {jobs.length === 0 && (
          <p className="strip-empty">Nothing snapped yet — point the camera at a question and hit SNAP.</p>
        )}
        {jobs.map((job) => (
          <div key={job.id} className={`thumb status-${job.status}`}>
            <span className="thumb-idx">{job.seq}</span>
            {thumbs[job.id] ? (
              <button
                className="thumb-img-btn"
                title="View question"
                onClick={() => onPreview(job.id)}
              >
                <img src={thumbs[job.id]} alt={`Question ${job.seq}`} />
              </button>
            ) : (
              <div className="thumb-placeholder" />
            )}
            <span className="thumb-badge">
              {job.status === "done" ? (job.answerLetter ?? "done") : STATUS_LABEL[job.status]}
            </span>
            {(job.status === "queued" || job.status === "error") && (
              <button
                className="thumb-delete"
                title="Remove"
                onClick={() => onDelete(job.id)}
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
