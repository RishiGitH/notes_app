// Unit tests for summaryOutputSchema (lib/ai/schemas.ts).
//
// The schema is the gate between raw model output and persistence/render.
// These tests assert that the validator rejects invalid shapes and accepts
// valid ones — the core of AGENTS.md section 2 item 6.

import { describe, it, expect } from "vitest";
import { summaryOutputSchema } from "@/lib/ai/schemas";

describe("summaryOutputSchema", () => {
  const valid = {
    tldr: "This is a short summary.",
    key_points: ["Point one", "Point two"],
    action_items: ["Action one"],
  };

  it("accepts a valid summary object", () => {
    expect(summaryOutputSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts empty action_items array", () => {
    expect(
      summaryOutputSchema.safeParse({ ...valid, action_items: [] }).success,
    ).toBe(true);
  });

  it("rejects missing tldr", () => {
    const result = summaryOutputSchema.safeParse({
      key_points: ["Point"],
      action_items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty tldr string", () => {
    const result = summaryOutputSchema.safeParse({ ...valid, tldr: "" });
    expect(result.success).toBe(false);
  });

  it("rejects tldr over 500 characters", () => {
    const result = summaryOutputSchema.safeParse({
      ...valid,
      tldr: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing key_points", () => {
    const result = summaryOutputSchema.safeParse({
      tldr: "summary",
      action_items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty key_points array", () => {
    const result = summaryOutputSchema.safeParse({ ...valid, key_points: [] });
    expect(result.success).toBe(false);
  });

  it("rejects key_points with more than 8 items", () => {
    const result = summaryOutputSchema.safeParse({
      ...valid,
      key_points: Array(9).fill("point"),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a key point over 200 characters", () => {
    const result = summaryOutputSchema.safeParse({
      ...valid,
      key_points: ["x".repeat(201)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects action_items with more than 8 items", () => {
    const result = summaryOutputSchema.safeParse({
      ...valid,
      action_items: Array(9).fill("action"),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an action item over 200 characters", () => {
    const result = summaryOutputSchema.safeParse({
      ...valid,
      action_items: ["x".repeat(201)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(summaryOutputSchema.safeParse("just a string").success).toBe(false);
    expect(summaryOutputSchema.safeParse(null).success).toBe(false);
    expect(summaryOutputSchema.safeParse(42).success).toBe(false);
  });

  it("rejects wrong type for tldr (number)", () => {
    const result = summaryOutputSchema.safeParse({ ...valid, tldr: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects wrong type for key_points (string instead of array)", () => {
    const result = summaryOutputSchema.safeParse({
      ...valid,
      key_points: "not an array",
    });
    expect(result.success).toBe(false);
  });
});
