import { describe, it, expect } from "vitest";
import { z } from "zod";

// Mirror the schema from main.ts (the worker itself can't be imported without
// triggering app.listen and execFile calls, so we test the schema in isolation)
const runSchema = z.object({
  archiveBase64: z.string().min(1),
  vars: z.array(z.string()).optional(),
});

describe("runSchema (worker input validation)", () => {
  it("accepts valid input with archiveBase64", () => {
    const result = runSchema.safeParse({ archiveBase64: "dGVzdA==" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.archiveBase64).toBe("dGVzdA==");
      expect(result.data.vars).toBeUndefined();
    }
  });

  it("accepts valid input with archiveBase64 and vars", () => {
    const result = runSchema.safeParse({
      archiveBase64: "dGVzdA==",
      vars: ["region=us-east-1", "env=prod"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vars).toEqual(["region=us-east-1", "env=prod"]);
    }
  });

  it("rejects missing archiveBase64", () => {
    const result = runSchema.safeParse({ vars: ["region=us-east-1"] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.errors.map((e) => e.path.join("."));
      expect(paths).toContain("archiveBase64");
    }
  });

  it("rejects empty archiveBase64 string", () => {
    const result = runSchema.safeParse({ archiveBase64: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.errors.map((e) => e.message);
      expect(messages.some((m) => m.toLowerCase().includes("least"))).toBe(true);
    }
  });

  it("rejects archiveBase64 of wrong type (number)", () => {
    const result = runSchema.safeParse({ archiveBase64: 12345 });
    expect(result.success).toBe(false);
  });

  it("rejects vars of wrong type (string instead of array)", () => {
    const result = runSchema.safeParse({ archiveBase64: "dGVzdA==", vars: "region=us-east-1" });
    expect(result.success).toBe(false);
  });

  it("rejects vars array with non-string elements", () => {
    const result = runSchema.safeParse({ archiveBase64: "dGVzdA==", vars: [1, 2, 3] });
    expect(result.success).toBe(false);
  });

  it("accepts vars as undefined (optional)", () => {
    const result = runSchema.safeParse({ archiveBase64: "dGVzdA==" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vars).toBeUndefined();
    }
  });
});

describe("path traversal detection logic", () => {
  // Mirror the logic from main.ts
  function hasPathTraversal(entries: string[]): boolean {
    return entries.some((e) => e.includes("../") || e.startsWith("/"));
  }

  it("detects ../ traversal entries", () => {
    expect(hasPathTraversal(["../etc/passwd"])).toBe(true);
    expect(hasPathTraversal(["foo/../bar"])).toBe(true);
    expect(hasPathTraversal(["foo/../../secret"])).toBe(true);
  });

  it("detects absolute path entries", () => {
    expect(hasPathTraversal(["/etc/passwd"])).toBe(true);
    expect(hasPathTraversal(["/absolute/path"])).toBe(true);
  });

  it("allows normal relative paths", () => {
    expect(hasPathTraversal(["main.tf"])).toBe(false);
    expect(hasPathTraversal(["modules/network/main.tf", "variables.tf"])).toBe(false);
    expect(hasPathTraversal(["a/b/c/file.tf"])).toBe(false);
  });

  it("allows empty list", () => {
    expect(hasPathTraversal([])).toBe(false);
  });
});
