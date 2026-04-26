// eslint-disable-next-line import/no-unresolved
import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  test: {
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "apps/web/src"),
      "@terraform-viz/graph-schema": path.resolve(root, "packages/graph-schema/src/index.ts"),
      "@terraform-viz/llm-types": path.resolve(root, "packages/llm-types/src/index.ts"),
      "@terraform-viz/pricing-types": path.resolve(root, "packages/pricing-types/src/index.ts"),
      "@terraform-viz/pricing-engine": path.resolve(root, "packages/pricing-engine/src/index.ts"),
    },
  },
});
