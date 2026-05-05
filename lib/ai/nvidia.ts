import "server-only";

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type NvidiaChatConfig = {
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
  timeoutMs?: number;
};

const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "mistralai/mistral-large-3-675b-instruct-2512";
const DEFAULT_TIMEOUT_MS = 90_000;

function getConfig() {
  return {
    apiKey: process.env.NVIDIA_API_KEY?.trim() ?? "",
    baseUrl: (process.env.NVIDIA_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: process.env.NVIDIA_CHAT_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: parsePositiveInt(process.env.NVIDIA_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS,
  };
}

export function isNvidiaConfigured() {
  return Boolean(getConfig().apiKey);
}

function classifyStatus(status: number) {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "payment";
  if (status === 408 || status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "request";
}

export function isTransientNvidiaError(error: unknown) {
  const code = typeof error === "object" && error !== null ? (error as any).code : "";
  return code === "network" || code === "server";
}

export function shouldFallbackFromNvidiaError(error: unknown) {
  const code = typeof error === "object" && error !== null ? (error as any).code : "";
  return code === "network" || code === "server" || code === "timeout" || code === "rate_limit" || code === "payment";
}

function parsePositiveInt(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function requestNvidia(config: NvidiaChatConfig) {
  const { apiKey, baseUrl, model, timeoutMs } = getConfig();
  if (!apiKey) {
    throw Object.assign(new Error("NVIDIA_API_KEY is not configured."), { code: "not_configured" });
  }

  const stream = Boolean(config.stream);
  const body = {
    model,
    messages: config.messages,
    max_tokens: config.maxTokens ?? 1024,
    temperature: config.temperature ?? 0.15,
    top_p: config.topP ?? 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    stream,
  };

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: stream ? "text/event-stream" : "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs ?? timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw Object.assign(new Error(`NVIDIA API error ${res.status}: ${errText.slice(0, 240)}`), {
        code: classifyStatus(res.status),
        status: res.status,
      });
    }

    return res;
  } catch (error: any) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw Object.assign(new Error("NVIDIA request timed out."), { code: "timeout" });
    }
    if (error?.code) throw error;
    throw Object.assign(new Error(error?.message ?? "Network error calling NVIDIA."), { code: "network" });
  }
}

export async function nvidiaText(config: Omit<NvidiaChatConfig, "stream">): Promise<string> {
  const res = await requestNvidia({ ...config, stream: false });
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) {
    throw Object.assign(new Error("NVIDIA returned an empty response."), { code: "empty" });
  }
  return text.trim();
}

export async function nvidiaStream(config: Omit<NvidiaChatConfig, "stream">): Promise<ReadableStream<Uint8Array>> {
  const res = await requestNvidia({ ...config, stream: true });
  const source = res.body;
  if (!source) {
    throw Object.assign(new Error("NVIDIA stream body is empty."), { code: "empty" });
  }

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const reader = source.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function processLine(line: string) {
        if (!line.startsWith("data: ")) return;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") return;
        try {
          const chunk = JSON.parse(jsonStr);
          const text = chunk?.choices?.[0]?.delta?.content ?? "";
          if (text) controller.enqueue(encoder.encode(text));
        } catch {
          // Skip malformed SSE lines.
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) processLine(line.trimEnd());
        }
        if (buffer.trim()) processLine(buffer.trimEnd());
      } finally {
        controller.close();
      }
    },
  });
}
