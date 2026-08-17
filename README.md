# Hydra CBT

**Snap exam questions continuously. Get AI answers on screen, in order, while you keep shooting.**

Hydra CBT turns your camera into a question-solving machine. Point it at a Computer-Based Test question, hit **SNAP**, and move to the next one — each photo is queued, read **one by one in capture order** by Google's Gemini vision model, and the answer appears in a live panel while you never stop snapping.

## Features

- 📸 **Continuous capture** — the camera never blocks; snap as fast as you can
- 🔢 **Strict snap-order processing** — answers appear in exactly the order you shot them, with stable numbering (survives reloads and deletions)
- ⚡ **Background AI queue** — photos are processed one at a time with a built-in rate-limit cooldown (default 10 reads/min, configurable)
- 🎯 **Option letters on thumbnails** — done snaps show `A`, `B`, `C`… right on the strip
- 👓 **Question preview lightbox** — click any thumbnail to zoom into the actual photo
- 🔄 **Re-snap flow** — if the AI can't read a photo (blurry/cut off), it says so instead of guessing; re-snap that one question in place, keeping its number
- 🔁 **Retry & delete** — failed reads retry; mistaken snaps are removed from the queue
- ⌨️ **Spacebar to snap** — keep both hands free
- 🖤 **High-contrast pitch-black UI** — built for exam lighting, easy on the eyes

## How it works

```
        📱 Your device                                   🖥️ Server (Node/Express)
┌──────────────────────────┐        POST /api/jobs        ┌─────────────────────────┐
│ Camera viewfinder        │ ──────▶ (base64, seq) ──────▶ │ FIFO queue (in-memory)  │
│ SNAP → downscale → queue │                              │ 1. seq order            │
│                          │                              │ 2. cooldown (GEMINI_RPM)│
│ Thumbnail strip          │                              │ 3. call Gemini vision   │
│ Answers panel ◀──poll────│ ◀──────── GET /api/jobs ─────│ 4. mark done/unreadable │
└──────────────────────────┘      (every 1.5s)            └─────────────────────────┘
```

- Images are **downscaled on your device** (max 1280px JPEG) before upload, so snapping stays fast
- The queue processes strictly one job at a time, in snap order, pausing between reads to respect the API rate limit
- Jobs live in server memory — restarting the server clears the queue

## Getting started

### Requirements

- Node.js 18+
- A free Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

### Install & run

```bash
npm install
# paste your API key into .env
npm run dev
```

Open **http://localhost:5173**, allow camera access, and start snapping.

> ⚠️ **Camera + HTTPS:** browsers only expose `getUserMedia` on secure contexts. `localhost` is fine, but if you test from a phone over LAN (`http://192.168.x.x`), the camera will be blocked — serve over HTTPS or use a tunnel like `ngrok`.

### Production

```bash
npm run build      # builds client + server
npm start          # serves everything on http://localhost:3001
```

## Configuration (`.env`)

| Variable            | Default                | Description                                        |
| ------------------- | ---------------------- | -------------------------------------------------- |
| `GEMINI_API_KEY`    | —                      | Your Google AI Studio API key                      |
| `GEMINI_MODEL`      | `gemini-3.5-flash-lite`| Gemini model used for reading questions            |
| `GEMINI_RPM`        | `10`                   | Max AI reads per minute (cooldown = 60s / RPM)     |
| `PORT`              | `3001`                 | API server port                                    |

## Project structure

```
├── client/            # React + Vite + TypeScript frontend
│   └── src/           # Camera, JobQueue strip, AnswersPanel, Lightbox
├── server/            # Express + TypeScript backend
│   ├── index.ts       # API routes (jobs, retry, resnap) + static serving
│   ├── queue.ts       # In-memory FIFO queue, seq collision guard, cooldown
│   └── ai.ts          # Gemini vision call + UNREADABLE/ANSWER parsing
└── .env               # Your local secrets (git-ignored)
```

## API

| Method | Endpoint                | Description                            |
| ------ | ----------------------- | -------------------------------------- |
| `GET`  | `/api/health`           | Server + API-key status                |
| `GET`  | `/api/jobs`             | All jobs, ordered by snap sequence     |
| `POST` | `/api/jobs`             | Enqueue a photo `{imageBase64, mimeType, seq}` |
| `PUT`  | `/api/jobs/:id`         | Re-snap: replace the photo, re-queue   |
| `POST` | `/api/jobs/:id/retry`   | Retry a failed job                     |
| `DELETE` | `/api/jobs/:id`       | Remove a job (not while processing)    |

## FAQ

**What if the photo is blurry?** The model replies `UNREADABLE: <reason>` instead of guessing; the card shows the reason with a **Re-snap** button — the camera re-arms for that exact question and keeps its number.

**Can I snap faster than the rate limit?** Yes — snapping never blocks. Photos just wait in the queue and are read one by one at the configured `GEMINI_RPM`.

**Are my photos stored anywhere?** Only in server memory, and only until the server stops. Nothing is written to disk or sent anywhere except to the Gemini API.

## Tech stack

React 18 · Vite · TypeScript · Express · Google Gemini REST API (no SDK)

## License

MIT