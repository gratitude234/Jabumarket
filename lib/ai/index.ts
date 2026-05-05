import "server-only";

import { geminiStream, geminiText, isGeminiConfigured } from "./gemini";
import {
  type AiChatMessage,
  isNvidiaConfigured,
  isTransientNvidiaError,
  nvidiaStream,
  nvidiaText,
  shouldFallbackFromNvidiaError,
} from "./nvidia";

export type { AiChatMessage } from "./nvidia";

export type AiRequestConfig = {
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  fallbackTimeoutMs?: number;
};

export type AiTextResult =
  | { ok: true; text: string; provider: "nvidia" | "gemini" }
  | { ok: false; error: string; provider?: "nvidia" | "gemini" };

export type AiJsonResult<T> =
  | { ok: true; data: T; provider: "nvidia" | "gemini"; rawText: string }
  | { ok: false; error: string; provider?: "nvidia" | "gemini"; rawText?: string };

export type AiStreamResult =
  | { ok: true; stream: ReadableStream<Uint8Array>; provider: "nvidia" | "gemini" }
  | { ok: false; error: string; provider?: "nvidia" | "gemini" };

function shouldFallbackToGemini() {
  return (process.env.AI_FALLBACK_PROVIDER?.trim().toLowerCase() || "gemini") === "gemini";
}

function errorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) return String((error as any).code);
  return "unknown";
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Unknown AI provider error.";
  const cause = (error as any).cause;
  const causeCode = cause?.code ? ` (${cause.code})` : "";
  const causeMessage = cause?.message ? `: ${cause.message}` : "";
  return `${error.message}${causeCode}${causeMessage}`;
}

function logProviderFailure(provider: "nvidia" | "gemini", operation: string, error: unknown) {
  console.warn(`[ai] ${provider} ${operation} failed (${errorCode(error)}): ${errorMessage(error).slice(0, 240)}`);
}

function fallbackConfig(config: AiRequestConfig): AiRequestConfig {
  if (!config.fallbackTimeoutMs) return config;
  return { ...config, timeoutMs: config.fallbackTimeoutMs };
}

function isTransientGeminiError(error: unknown) {
  const code = errorCode(error);
  return code === "network" || code === "timeout" || code === "server";
}

function stripJsonFences(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

export function parseJsonText<T>(text: string): T {
  const clean = stripJsonFences(text);
  try {
    return JSON.parse(clean) as T;
  } catch {
    const objectStart = clean.indexOf("{");
    const objectEnd = clean.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(clean.slice(objectStart, objectEnd + 1)) as T;
    }

    const arrayStart = clean.indexOf("[");
    const arrayEnd = clean.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(clean.slice(arrayStart, arrayEnd + 1)) as T;
    }

    throw Object.assign(new Error("AI response was not valid JSON."), { code: "invalid_json" });
  }
}

export async function generateText(config: AiRequestConfig): Promise<AiTextResult> {
  let nvidiaFailure: unknown;

  if (isNvidiaConfigured()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await nvidiaText(config);
        return { ok: true, text, provider: "nvidia" };
      } catch (error) {
        nvidiaFailure = error;
        logProviderFailure("nvidia", "generateText", error);
        if (attempt === 0 && isTransientNvidiaError(error)) continue;
        break;
      }
    }
  }

  if (nvidiaFailure && !shouldFallbackFromNvidiaError(nvidiaFailure)) {
    return { ok: false, error: errorMessage(nvidiaFailure), provider: "nvidia" };
  }

  if (shouldFallbackToGemini() && isGeminiConfigured()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await geminiText(fallbackConfig(config));
        return { ok: true, text, provider: "gemini" };
      } catch (error) {
        logProviderFailure("gemini", "generateText", error);
        if (attempt === 0 && isTransientGeminiError(error)) continue;
        return { ok: false, error: errorMessage(error), provider: "gemini" };
      }
    }
  }

  return { ok: false, error: "AI service is not configured." };
}

export async function generateJson<T>(config: AiRequestConfig): Promise<AiJsonResult<T>> {
  let nvidiaFailure: unknown;

  if (isNvidiaConfigured()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rawText = await nvidiaText(config);
        return { ok: true, data: parseJsonText<T>(rawText), provider: "nvidia", rawText };
      } catch (error) {
        nvidiaFailure = error;
        logProviderFailure("nvidia", "generateJson", error);
        if (attempt === 0 && isTransientNvidiaError(error)) continue;
        break;
      }
    }
  }

  if (nvidiaFailure && !shouldFallbackFromNvidiaError(nvidiaFailure)) {
    return { ok: false, error: errorMessage(nvidiaFailure), provider: "nvidia" };
  }

  if (shouldFallbackToGemini() && isGeminiConfigured()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rawText = await geminiText(fallbackConfig(config));
        return { ok: true, data: parseJsonText<T>(rawText), provider: "gemini", rawText };
      } catch (error) {
        logProviderFailure("gemini", "generateJson", error);
        if (attempt === 0 && isTransientGeminiError(error)) continue;
        return { ok: false, error: errorMessage(error), provider: "gemini" };
      }
    }
  }

  return { ok: false, error: "AI service is not configured." };
}

export async function streamText(config: AiRequestConfig): Promise<AiStreamResult> {
  let nvidiaFailure: unknown;

  if (isNvidiaConfigured()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const stream = await nvidiaStream(config);
        return { ok: true, stream, provider: "nvidia" };
      } catch (error) {
        nvidiaFailure = error;
        logProviderFailure("nvidia", "streamText", error);
        if (attempt === 0 && isTransientNvidiaError(error)) continue;
        break;
      }
    }
  }

  if (nvidiaFailure && !shouldFallbackFromNvidiaError(nvidiaFailure)) {
    return { ok: false, error: errorMessage(nvidiaFailure), provider: "nvidia" };
  }

  if (shouldFallbackToGemini() && isGeminiConfigured()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const stream = await geminiStream(fallbackConfig(config));
        return { ok: true, stream, provider: "gemini" };
      } catch (error) {
        logProviderFailure("gemini", "streamText", error);
        if (attempt === 0 && isTransientGeminiError(error)) continue;
        return { ok: false, error: errorMessage(error), provider: "gemini" };
      }
    }
  }

  return { ok: false, error: "AI service is not configured." };
}

export function userMessage(content: string): AiChatMessage {
  return { role: "user", content };
}

export function systemMessage(content: string): AiChatMessage {
  return { role: "system", content };
}
