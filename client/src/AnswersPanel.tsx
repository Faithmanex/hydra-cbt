import type { Job } from "./types";

interface Props {
  jobs: Job[];
  thumbs: Record<string, string>;
  onRetry: (id: string) => void;
  onPreview: (id: string) => void;
  onResnap: (id: string) => void;
}

function renderAnswer(text: string) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const [first, ...rest] = lines;
  const isLead = /^answer\s*:/i.test(first);
  return (
    <>
      <div className={isLead ? "answer-lead" : "answer-line"}>{first}</div>
      {rest.map((line, i) => (
        <div key={i} className="answer-line">
          {line}
        </div>
      ))}
    </>
  );
}

export function AnswersPanel({ jobs, thumbs, onRetry, onPreview, onResnap }: Props) {
  const done = jobs.filter((j) => j.status === "done").length;
  const pct = jobs.length === 0 ? 0 : Math.round((done / jobs.length) * 100);

  return (
    <aside className="answers">
      <div className="answers-header">
        <h2>Answers</h2>
        <span className="answers-count">
          {done}/{jobs.length} answered
        </span>
      </div>
      <div className="progress">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="answers-list">
        {jobs.length === 0 && (
          <p className="answers-empty">
            Nothing here yet. Snap your first question and the answer will
            appear in this panel, in order.
          </p>
        )}
        {jobs.map((job) => (
          <div key={job.id} className={`answer-card status-${job.status}`}>
            <div className="answer-card-head">
              <span className="answer-num">{job.seq}</span>
              {thumbs[job.id] && (
                <button
                  className="answer-thumb-btn"
                  title="View question"
                  onClick={() => onPreview(job.id)}
                >
                  <img src={thumbs[job.id]} alt="" className="answer-thumb" />
                </button>
              )}
              <span className={`badge badge-${job.status}`}>{job.status}</span>
            </div>
            {job.status === "done" && (
              <div className="answer-body">
                {job.answerLetter && (
                  <span className="answer-letter">Answer: {job.answerLetter}</span>
                )}
                {job.answer && <div className="answer-text">{renderAnswer(job.answer)}</div>}
              </div>
            )}
            {job.status === "queued" && (
              <div className="answer-pending">Waiting in queue — will be read next.</div>
            )}
            {job.status === "processing" && (
              <div className="answer-pending">
                <span className="spinner small" /> Reading question…
              </div>
            )}
            {job.status === "error" && (
              <div className="answer-error">
                <p>Failed: {job.error}</p>
                <button className="btn" onClick={() => onRetry(job.id)}>
                  Retry
                </button>
              </div>
            )}
            {job.status === "unreadable" && (
              <div className="answer-error">
                <p>{job.answer}</p>
                <button className="btn" onClick={() => onResnap(job.id)}>
                  Re-snap this question
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}