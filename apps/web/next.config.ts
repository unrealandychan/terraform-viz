import type { NextConfig } from "next";

// When building for Tauri desktop (TAURI_BUILD=1), use static export.
// Otherwise keep "standalone" for Docker / server deployment.
const isTauriBuild = process.env["TAURI_BUILD"] === "1";

const config: NextConfig = {
  reactStrictMode: true,
  output: isTauriBuild ? "export" : "standalone",
  // Static export: trailing slashes help route correctly when Tauri serves bundled assets
  // without a Next.js server (typically via its asset/custom protocol in production).
  ...(isTauriBuild ? { trailingSlash: true } : {}),
  // Static export cannot use image optimisation (requires a server).
  ...(isTauriBuild ? { images: { unoptimized: true } } : {}),
  transpilePackages: [
    "@terraform-viz/pricing-engine",
    "@terraform-viz/graph-schema",
    "@terraform-viz/pricing-types",
  ],
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
  // Enable Turbopack (Next.js 16+)
  turbopack: {},
};

export default config;
