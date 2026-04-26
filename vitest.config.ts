import { defineConfig } from "vitest/config";
import { resolve } from "path";
export default defineConfig({
  test: {
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    environment: "node",
    environmentMatchGlobs: [
      ["apps/web/**", "jsdom"],
    ],
    globals: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "apps/web/src"),
      "@terraform-viz/graph-schema": resolve(__dirname, "packages/graph-schema/src/index.ts"),
      "@terraform-viz/llm-types": resolve(__dirname, "packages/llm-types/src/index.ts"),
      "@terraform-viz/pricing-types": resolve(__dirname, "packages/pricing-types/src/index.ts"),
      "@terraform-viz/pricing-engine": resolve(__dirname, "packages/pricing-engine/src/index.ts"),
    },
  },
});
