import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Required to activate instrumentation.ts (register + onRequestError hooks).
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
