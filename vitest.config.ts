import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    environmentMatchGlobs: [
      // DB-hitting test tiers need Node, not jsdom.
      ["tests/tenant-isolation/**", "node"],
      ["tests/integration/**", "node"],
    ],
    globalSetup: ["./tests/tenant-isolation/globalSetup.ts"],
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
