import type { Job } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function getJobs(): Promise<Job[]> {
  return request<Job[]>("/api/jobs");
}

export function postJob(imageBase64: string, mimeType: string, seq: number): Promise<Job> {
  return request<Job>("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType, seq }),
  });
}

export function deleteJob(id: string): Promise<void> {
  return request<void>(`/api/jobs/${id}`, { method: "DELETE" });
}

export function retryJob(id: string): Promise<Job> {
  return request<Job>(`/api/jobs/${id}/retry`, { method: "POST" });
}

export function resnapJob(id: string, imageBase64: string, mimeType: string): Promise<Job> {
  return request<Job>(`/api/jobs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType }),
  });
}
