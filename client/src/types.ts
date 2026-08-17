export type JobStatus = "queued" | "processing" | "done" | "error" | "unreadable";

export interface Job {
  id: string;
  seq: number;
  status: JobStatus;
  error?: string;
  answer?: string;
  answerLetter?: string;
  createdAt: number;
  processedAt?: number;
}
