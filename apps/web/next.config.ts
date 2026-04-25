import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  output: "standalone",
  env: {
    PARSER_URL: process.env["PARSER_URL"] ?? "http://localhost:3001",
    PRICING_URL: process.env["PRICING_URL"] ?? "http://localhost:3002",
    COMPARISON_URL: process.env["COMPARISON_URL"] ?? "http://localhost:3003",
    LLM_URL: process.env["LLM_URL"] ?? "http://localhost:3004",
  },
  // Suppress SSR issues from visualization libraries
  webpack(webpackConfig) {
    return webpackConfig;
  },
};

export default config;
