const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

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

export function hasApiKey(): boolean {
  return API_KEY.trim().length > 0;
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

export async function answerQuestion(imageBase64: string, mimeType: string): Promise<string> {
  if (!hasApiKey()) {
    throw new Error("GEMINI_API_KEY is not set on the server");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

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

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts: unknown[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => ((p as { text?: string })?.text ?? ""))
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response");
  }
  return text;
}
