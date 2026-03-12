// lib/gemini.ts
// Shared Gemini 2.5 Flash-Lite client — server-side only.
// Never import this from a "use client" file.

const MODEL = "gemini-2.5-flash-lite";
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type GeminiConfig = {
  temperature?: number;
  maxOutputTokens?: number;
};

export type GeminiResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Call Gemini with a single user prompt.
 * Returns { ok: true, text } on success, { ok: false, error } on failure.
 */
export async function gemini(
  prompt: string,
  config: GeminiConfig = {}
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY is not configured." };
  }

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: config.temperature ?? 0.4,
      maxOutputTokens: config.maxOutputTokens ?? 600,
    },
  };

  try {
    const res = await fetch(`${BASE_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // 20s timeout via AbortSignal
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      return { ok: false, error: `Gemini API error ${res.status}: ${err}` };
    }

    const data = await res.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!text.trim()) {
      return { ok: false, error: "Gemini returned an empty response." };
    }

    return { ok: true, text: text.trim() };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error calling Gemini." };
  }
}

/**
 * Call Gemini expecting a JSON response.
 * Strips markdown fences before parsing.
 */
export async function geminiJson<T = unknown>(
  prompt: string,
  config: GeminiConfig = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const result = await gemini(prompt, config);
  if (!result.ok) return result;

  try {
    const clean = result.text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return { ok: true, data: JSON.parse(clean) as T };
  } catch {
    return { ok: false, error: "Gemini response was not valid JSON." };
  }
}