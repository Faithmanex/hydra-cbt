const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const RPM_PER_KEY = Math.max(1, Number(process.env.GEMINI_RPM ?? 10));

const PROMPT = [
  "You are an exam assistant. The image contains an exam question.",
  "1) Extract the question and all its options (A, B, C, D...).",
  "2) Determine the correct answer(s). If more than one option is correct, list all letters.",
  "3) Reply in exactly this format:",
  "ANSWER: <letter(s), e.g. B or B, D>",
  "<the full answer text>",
  "EXPLANATION: <1-2 sentence explanation>",
  "4) If the image is blurry, cut off, upside down, unreadable, or does not clearly show a question with options, do NOT guess. Reply with exactly:",
  "UNREADABLE: <one-sentence reason>",
  "Be concise. Do not mention the photo quality.",
].join("\n");

// ── Key rotation ──────────────────────────────────────────────
interface KeyState {
  key: string;
  lastUsed: number;
  requestTimes: number[]; // timestamps within last 60s
  rateLimitedUntil: number;
  invalid: boolean;
  consecutiveErrors: number;
}

let _keys: KeyState[] | null = null;

function parseKeys(): KeyState[] {
  if (_keys) return _keys;
  const rawParts: string[] = [];
  // Support both GEMINI_API_KEY and GEMINI_API_KEYS, comma or newline separated
  for (const envName of ["GEMINI_API_KEY", "GEMINI_API_KEYS"]) {
    const v = process.env[envName];
    if (v) {
      // split by comma, newline, space
      rawParts.push(...v.split(/[\n,]+/));
    }
  }
  const seen = new Set<string>();
  const list: KeyState[] = [];
  for (const part of rawParts) {
    const k = part.trim();
    if (!k || seen.has(k)) continue;
    // Basic sanity: Gemini keys start with AIza, but accept any non-empty
    if (k.length < 20) continue;
    seen.add(k);
    list.push({
      key: k,
      lastUsed: 0,
      requestTimes: [],
      rateLimitedUntil: 0,
      invalid: false,
      consecutiveErrors: 0,
    });
  }
  _keys = list;
  if (list.length > 1) {
    console.log(`[keys] Loaded ${list.length} Gemini API keys (RPM per key: ${RPM_PER_KEY})`);
  } else if (list.length === 1) {
    console.log(`[keys] Loaded 1 Gemini API key (RPM: ${RPM_PER_KEY})`);
  }
  return _keys;
}

export function hasApiKey(): boolean {
  const keys = parseKeys();
  return keys.some((k) => !k.invalid);
}

export function getApiKeyCount(): number {
  return parseKeys().length;
}

export function getApiKeyStats() {
  const keys = parseKeys();
  const now = Date.now();
  return {
    totalKeys: keys.length,
    validKeys: keys.filter((k) => !k.invalid).length,
    rpmPerKey: RPM_PER_KEY,
    effectiveRpm: keys.filter((k) => !k.invalid).length * RPM_PER_KEY,
    keys: keys.map((k, i) => ({
      index: i,
      invalid: k.invalid,
      rateLimitedUntil: k.rateLimitedUntil,
      rateLimitedForMs: Math.max(0, k.rateLimitedUntil - now),
      requestsInLastMinute: k.requestTimes.filter((t) => now - t < 60000).length,
      consecutiveErrors: k.consecutiveErrors,
      lastUsedAgoMs: k.lastUsed ? now - k.lastUsed : null,
    })),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanOldRequests(k: KeyState, now: number) {
  k.requestTimes = k.requestTimes.filter((t) => now - t < 60000);
}

function getWaitTimeMs(k: KeyState, now: number): number {
  if (k.invalid) return Infinity;
  if (k.rateLimitedUntil > now) return k.rateLimitedUntil - now;
  cleanOldRequests(k, now);
  if (k.requestTimes.length < RPM_PER_KEY) return 0;
  const oldest = Math.min(...k.requestTimes);
  return 60000 - (now - oldest) + 50;
}

async function acquireKey(): Promise<KeyState> {
  const keys = parseKeys();
  if (keys.length === 0) throw new Error("GEMINI_API_KEY is not set on the server (no valid keys)");
  if (keys.every((k) => k.invalid)) throw new Error("All Gemini API keys are marked invalid");

  while (true) {
    const now = Date.now();
    let best: KeyState | null = null;
    let minWait = Infinity;

    for (const k of keys) {
      const wait = getWaitTimeMs(k, now);
      if (wait === 0) {
        if (!best || k.lastUsed < best.lastUsed) best = k;
      } else if (wait < minWait) {
        minWait = wait;
      }
    }

    if (best) {
      best.lastUsed = Date.now();
      best.requestTimes.push(Date.now());
      return best;
    }

    if (minWait === Infinity) {
      throw new Error("No available API keys (all invalid or rate-limited)");
    }
    // Wait for the earliest key to become available (cap to avoid long hangs)
    const wait = Math.min(minWait, 60000);
    // console.log(`[keys] All keys at limit, waiting ${wait}ms...`);
    await sleep(wait);
  }
}

function markRateLimited(k: KeyState, retryAfterMs?: number) {
  const now = Date.now();
  const delay = retryAfterMs && retryAfterMs > 0 && retryAfterMs < 300000 ? retryAfterMs : 60000;
  k.rateLimitedUntil = now + delay;
  // Also keep requestTimes to enforce window
  console.warn(`[keys] Key ...${k.key.slice(-6)} rate-limited, cooling down ${delay}ms`);
}

function markInvalid(k: KeyState, reason: string) {
  k.invalid = true;
  console.error(`[keys] Key ...${k.key.slice(-6)} marked invalid: ${reason}`);
}

function markSuccess(k: KeyState) {
  k.consecutiveErrors = 0;
  k.rateLimitedUntil = 0;
}

function markError(k: KeyState) {
  k.consecutiveErrors += 1;
  // If a key errors 5 times in a row, temporarily cool it down
  if (k.consecutiveErrors >= 5) {
    k.rateLimitedUntil = Date.now() + 30000;
    console.warn(`[keys] Key ...${k.key.slice(-6)} 5 consecutive errors, cooling 30s`);
  }
}

export function parseAnswerLetter(answer: string): string | undefined {
  const match = answer.match(/^ANSWER:\s*(.+)$/im);
  if (!match) return undefined;
  const value = match[1].trim();
  return value.length > 0 && value.length <= 16 ? value : undefined;
}

export function parseUnreadableReason(answer: string): string | undefined {
  const match = answer.match(/^UNREADABLE\s*:\s*(.+)$/is);
  if (!match) return undefined;
  return match[1].trim() || "The image could not be read";
}

async function callGeminiWithKey(
  key: string,
  imageBase64: string,
  mimeType: string
): Promise<{ ok: boolean; status: number; body: string; data?: any; retryAfterMs?: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
    }),
  });

  // Try to parse Retry-After header for 429
  let retryAfterMs: number | undefined;
  if (res.status === 429) {
    const ra = res.headers.get("retry-after") || res.headers.get("Retry-After");
    if (ra) {
      const secs = Number(ra);
      if (!isNaN(secs)) retryAfterMs = secs * 1000;
      else {
        // Could be HTTP date
        const date = Date.parse(ra);
        if (!isNaN(date)) retryAfterMs = Math.max(0, date - Date.now());
      }
    }
  }

  const body = await res.text();
  let data: any = undefined;
  try {
    data = JSON.parse(body);
  } catch {}

  return { ok: res.ok, status: res.status, body, data, retryAfterMs };
}

export async function answerQuestion(imageBase64: string, mimeType: string): Promise<string> {
  const keys = parseKeys();
  if (keys.length === 0) throw new Error("GEMINI_API_KEY is not set on the server");

  let lastError: Error | null = null;
  // Try each key at most twice (in case of transient 429s)
  const maxAttempts = Math.max(keys.length * 2, 3);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const keyState = await acquireKey();
    const key = keyState.key;

    try {
      const { ok, status, body, data, retryAfterMs } = await callGeminiWithKey(key, imageBase64, mimeType);

      if (ok) {
        markSuccess(keyState);
        const parts: unknown[] = data?.candidates?.[0]?.content?.parts ?? [];
        const text = parts
          .map((p) => ((p as { text?: string })?.text ?? ""))
          .join("\n")
          .trim();
        if (!text) throw new Error("Gemini returned an empty response");
        return text;
      }

      // Handle rate limit (429) — rotate to next key
      if (status === 429) {
        markRateLimited(keyState, retryAfterMs);
        lastError = new Error(`Gemini 429 rate-limited (key ...${key.slice(-6)}), rotating...`);
        // Try next key without counting as consecutive error for invalid
        // Wait a tiny bit before retrying next key to avoid tight loop
        await sleep(200);
        continue;
      }

      // Invalid key / quota exhausted (400/403 with specific messages)
      if (status === 400 || status === 403) {
        const lowerBody = body.toLowerCase();
        if (
          lowerBody.includes("api_key_invalid") ||
          lowerBody.includes("api key invalid") ||
          lowerBody.includes("invalid api key") ||
          lowerBody.includes("permission_denied") ||
          lowerBody.includes("key not found")
        ) {
          markInvalid(keyState, body.slice(0, 200));
          lastError = new Error(`Gemini ${status} invalid key ...${key.slice(-6)}: ${body.slice(0, 200)}`);
          continue;
        }
        // For other 400s, treat as per-key error but not invalid, try next key after brief wait
        // e.g., quota exceeded for this key's project
        if (lowerBody.includes("quota") || lowerBody.includes("resource_exhausted") || lowerBody.includes("billing")) {
          markRateLimited(keyState, retryAfterMs || 120000);
          lastError = new Error(`Gemini ${status} quota on key ...${key.slice(-6)}: ${body.slice(0, 200)}`);
          await sleep(500);
          continue;
        }
      }

      // For 500/503 transient errors, mark error and retry with next key
      if (status >= 500) {
        markError(keyState);
        lastError = new Error(`Gemini API ${status}: ${body.slice(0, 300)}`);
        await sleep(500);
        continue;
      }

      // For other 4xx, don't rotate immediately, throw
      throw new Error(`Gemini API ${status}: ${body.slice(0, 300)}`);
    } catch (err) {
      // Network/timeout errors
      if (err instanceof Error && err.message.includes("rate-limited")) {
        // Already handled above, continue to next key
        continue;
      }
      if (err instanceof Error && err.name === "TimeoutError") {
        markError(keyState);
        lastError = new Error(`Gemini timeout (key ...${key.slice(-6)})`);
        await sleep(300);
        continue;
      }
      // Re-throw if already a Gemini API error we constructed
      if (err instanceof Error && err.message.startsWith("Gemini API")) {
        markError(keyState);
        lastError = err;
        await sleep(300);
        continue;
      }
      markError(keyState);
      lastError = err instanceof Error ? err : new Error(String(err));
      await sleep(300);
      continue;
    }
  }

  throw lastError || new Error("All Gemini API keys failed");
}
