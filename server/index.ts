import * as fs from "fs";
import * as path from "path";
import cors from "cors";
import express from "express";
import "./env";
import { hasApiKey, getApiKeyStats } from "./ai";
import { JobQueue } from "./queue";

const app = express();
const queue = new JobQueue();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get("/api/health", (_req, res) => {
  const stats = getApiKeyStats();
  res.json({
    ok: true,
    apiKeyConfigured: hasApiKey(),
    keys: stats,
  });
});

app.get("/api/jobs", (_req, res) => {
  res.json(queue.list());
});

app.post("/api/jobs", (req, res) => {
  const { imageBase64, mimeType, seq } = req.body ?? {};
  if (
    typeof imageBase64 !== "string" ||
    imageBase64.length === 0 ||
    typeof mimeType !== "string"
  ) {
    res.status(400).json({ error: "imageBase64 and mimeType are required" });
    return;
  }
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 1) {
    res.status(400).json({ error: "seq must be a positive integer" });
    return;
  }
  const job = queue.add(imageBase64, mimeType, seq);
  res.status(201).json(job);
});

app.post("/api/jobs/:id/retry", (req, res) => {
  const job = queue.retry(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found or not retryable" });
    return;
  }
  res.json(job);
});

app.put("/api/jobs/:id", (req, res) => {
  const { imageBase64, mimeType } = req.body ?? {};
  if (
    typeof imageBase64 !== "string" ||
    imageBase64.length === 0 ||
    typeof mimeType !== "string"
  ) {
    res.status(400).json({ error: "imageBase64 and mimeType are required" });
    return;
  }
  const job = queue.resnap(req.params.id, imageBase64, mimeType);
  if (!job) {
    res.status(404).json({ error: "Job not found or currently processing" });
    return;
  }
  res.json(job);
});

app.delete("/api/jobs/:id", (req, res) => {
  if (!queue.remove(req.params.id)) {
    res.status(404).json({ error: "Job not found or currently processing" });
    return;
  }
  res.status(204).end();
});

const clientDistCandidates = [
  path.resolve(__dirname, "..", "client", "dist"),
  path.resolve(__dirname, "..", "..", "client", "dist"),
  path.resolve(process.cwd(), "client", "dist"),
  path.resolve(process.cwd(), "..", "client", "dist"),
];
const clientDist = clientDistCandidates.find((p) => fs.existsSync(path.join(p, "index.html")));
if (clientDist) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

export default app;

// Compatibility for Vercel @vercel/node (CommonJS require)
declare const module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = app;
  module.exports.default = app;
}

// Vercel uses the exported app as a serverless function — don't listen there
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Hydra CBT server on http://localhost:${PORT}`);
    if (!hasApiKey()) {
      console.warn("WARNING: GEMINI_API_KEY is not set — answers will fail. Add it to .env");
    }
  });
}
