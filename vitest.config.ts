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
    // Tenant-isolation tests share a real Postgres instance. Run files
    // sequentially (pool: 'forks', maxForks: 1) so beforeAll/afterAll
    // boundaries from different test files don't overlap.
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 1,
        minForks: 1,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
