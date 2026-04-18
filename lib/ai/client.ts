import Anthropic from "@anthropic-ai/sdk";

// Default model ID. Never hard-code a deprecated id (no claude-3-5-*,
// no claude-opus-4-0). Runtime override via ANTHROPIC_MODEL env var.
export const DEFAULT_MODEL = "claude-sonnet-4-6";

export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey });
}

export function getModelId() {
  return process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
}
