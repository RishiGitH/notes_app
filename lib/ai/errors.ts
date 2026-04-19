// AI-specific error types. Exported from a plain module (not "use server")
// so they can be imported by both Server Actions and client components.

/**
 * Thrown by generateSummary when the model's output fails zod validation.
 * The caller (ai-summary-tab) catches this and surfaces an appropriate
 * UI message without exposing raw model output to the user.
 */
export class AiOutputInvalidError extends Error {
  constructor(reason: string) {
    super(`AI output did not match expected schema: ${reason}`);
    this.name = "AiOutputInvalidError";
  }
}
