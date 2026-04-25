import { describe, it, expect } from "vitest";
import { encodePlan, decodePlan, PLAN_URL_PARAM } from "../lib/plan-url";
import type { GraphModel } from "@terraform-viz/graph-schema";

function makeModel(id = "url-test"): GraphModel {
  return {
    id,
    provider: "AWS",
    nodes: [
      {
        id: "node-0",
        type: "aws_s3_bucket",
        name: "bucket",
        provider: "AWS",
        layer: "storage",
        action: "create",
        attributes: {},
        dependencies: [],
      },
    ],
    edges: [],
    metadata: { generatedAt: new Date().toISOString(), planHash: "xyz", workspaceRoot: "/" },
  };
}

describe("plan-url", () => {
  it("PLAN_URL_PARAM is a non-empty string", () => {
    expect(typeof PLAN_URL_PARAM).toBe("string");
    expect(PLAN_URL_PARAM.length).toBeGreaterThan(0);
  });

  it("encodePlan / decodePlan round-trips a GraphModel", async () => {
    const model = makeModel();
    const encoded = await encodePlan(model);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = await decodePlan(encoded);
    expect(decoded.id).toBe(model.id);
    expect(decoded.nodes).toHaveLength(model.nodes.length);
    expect(decoded.nodes[0]?.name).toBe("bucket");
  });

  it("encoded string is URL-safe (no +, /, or = chars)", async () => {
    const encoded = await encodePlan(makeModel());
    expect(encoded).not.toMatch(/[+/=]/);
  });
});
