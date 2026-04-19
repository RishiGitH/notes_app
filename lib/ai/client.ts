type ChatRole = "system" | "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface DoChatCompletionRequest {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
}

interface DoChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: string;
  };
}

// DigitalOcean's Inference API is OpenAI-compatible chat completions.
// Keep the model overrideable via env for deployments.
export const DEFAULT_MODEL = "anthropic-claude-4.6-sonnet";
export const DEFAULT_INFERENCE_ENDPOINT = "https://inference.do-ai.run/v1/chat/completions";

function getModelAccessKey() {
  const key = process.env.MODEL_ACCESS_KEY;
  if (!key) {
    throw new Error("MODEL_ACCESS_KEY is not set");
  }
  return key;
}

export function getModelId() {
  return process.env.DO_MODEL ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
}

export function getInferenceEndpoint() {
  return process.env.DO_INFERENCE_ENDPOINT ?? DEFAULT_INFERENCE_ENDPOINT;
}

function coerceContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const maybeText = (part as { text?: unknown }).text;
          return typeof maybeText === "string" ? maybeText : "";
        }
        return "";
      })
      .filter(Boolean);
    return textParts.join("\n");
  }
  return "";
}

export async function createDoChatCompletion({
  messages,
  maxTokens,
  temperature = 0,
}: DoChatCompletionRequest): Promise<string> {
  const endpoint = getInferenceEndpoint();
  const model = getModelId();
  const apiKey = getModelAccessKey();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  const payload = (await response.json()) as DoChatCompletionResponse;

  if (!response.ok) {
    const detail = payload.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`DO inference request failed: ${detail}`);
  }

  const firstMessageContent = payload.choices?.[0]?.message?.content;
  const text = coerceContentToText(firstMessageContent).trim();

  if (!text) {
    throw new Error("DO inference response did not include message content");
  }

  return text;
}
