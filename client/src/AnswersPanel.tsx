import type { Job } from "./types";

interface Props {
  jobs: Job[];
  thumbs: Record<string, string>;
  onRetry: (id: string) => void;
  onPreview: (id: string) => void;
  onResnap: (id: string) => void;
}

function getQuestionSnippet(job: Job): string {
  if (!job.answer) return `Q${job.seq}`;
  const m = job.answer.match(/^QUESTION:\s*(.+)$/im);
  if (m) {
    let snippet = m[1].trim();
    const words = snippet.split(/\s+/).slice(0, 5).join(" ");
    return words || `Q${job.seq}`;
  }
  return `Q${job.seq}`;
}

function getAnswerParts(job: Job): { letter: string; text: string } | null {
  if (!job.answer) return null;
  // New format: ANSWER: B: Paris
  let m = job.answer.match(/^ANSWER:\s*([A-Za-z]+(?:\s*,\s*[A-Za-z]+)*)\s*:\s*(.+)$/im);
  if (m) return { letter: m[1].replace(/\s+/g, "").toUpperCase(), text: m[2].trim() };
  // Use parsed letter from job if available and try to get content
  if (job.answerLetter) {
    const lines = job.answer.split("\n").map((l) => l.trim()).filter(Boolean);
    const idx = lines.findIndex((l) => /^ANSWER\s*:/i.test(l));
    if (idx !== -1 && lines[idx + 1]) {
      // If next line is not QUESTION/UNREADABLE, treat as content
      const next = lines[idx + 1];
      if (!/^QUESTION\s*:/i.test(next) && !/^UNREADABLE/i.test(next)) {
        // Remove leading letter if present
        const cleaned = next.replace(/^[A-D]\s*[:\-]\s*/i, "").trim();
        return { letter: job.answerLetter, text: cleaned || next };
      }
    }
    // Fallback: try to extract after colon in first line
    const first = lines[idx] || "";
    const afterColon = first.split(":").slice(2).join(":").trim(); // split ANSWER: B: text -> third part
    if (afterColon) return { letter: job.answerLetter, text: afterColon };
    return { letter: job.answerLetter, text: "" };
  }
  return null;
}

export function AnswersPanel({ jobs, thumbs, onRetry, onPreview, onResnap }: Props) {
  const done = jobs.filter((j) => j.status === "done").length;
  const pct = jobs.length === 0 ? 0 : Math.round((done / jobs.length) * 100);

  return (
    <aside className="answers">
      <div className="answers-header">
        <h2>Answers</h2>
        <span className="answers-count">
          {done}/{jobs.length}
        </span>
      </div>
      <div className="progress">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="answers-list">
        {jobs.length === 0 && (
          <p className="answers-empty">Snap a question — answers appear here instantly.</p>
        )}
        {jobs.map((job) => {
          const snippet = getQuestionSnippet(job);
          const ans = getAnswerParts(job);
          return (
            <div key={job.id} className={`answer-card status-${job.status}`}>
              <div className="answer-card-head">
                <span className="answer-num">Q{job.seq}</span>
                {thumbs[job.id] && (
                  <button
                    className="answer-thumb-btn"
                    title="View"
                    onClick={() => onPreview(job.id)}
                  >
                    <img src={thumbs[job.id]} alt="" className="answer-thumb" />
                  </button>
                )}
                <span className={`badge badge-${job.status}`}>{job.status}</span>
              </div>

              {job.status === "done" && ans && (
                <div className="answer-body">
                  <div className="question-snippet">
                    <b>{snippet}</b> <span className="ellipsis">...</span>
                  </div>
                  <div className="answer-blue">
                    <span className="answer-letter-big">{ans.letter}:</span>
                    <span className="answer-content">{ans.text}</span>
                  </div>
                </div>
              )}

              {job.status === "done" && !ans && job.answer && (
                <div className="answer-body">
                  <div className="question-snippet">
                    <b>{snippet}</b> <span className="ellipsis">...</span>
                  </div>
                  <div className="answer-blue">
                    <span className="answer-content">{job.answer}</span>
                  </div>
                </div>
              )}

              {job.status === "queued" && (
                <div className="answer-pending">Queued — reading next…</div>
              )}
              {job.status === "processing" && (
                <div className="answer-pending">
                  <span className="spinner small" /> Reading…
                </div>
              )}
              {job.status === "error" && (
                <div className="answer-error">
                  <p>Failed: {job.error}</p>
                  <button className="btn btn-full" onClick={() => onRetry(job.id)}>
                    Retry
                  </button>
                </div>
              )}
              {job.status === "unreadable" && (
                <div className="answer-error">
                  <p>{job.answer}</p>
                  <button className="btn btn-full" onClick={() => onResnap(job.id)}>
                    Re-snap
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
