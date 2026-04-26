/**
 * Unit tests for GraphFilterBar pure logic (no rendering).
 * React rendering is covered by Playwright E2E.
 */
import { describe, it, expect } from "vitest";
import { getNodeTags, type GraphFilter } from "../components/graph/GraphFilterBar";
import { ChangeAction, CloudProvider, ResourceLayer } from "@terraform-viz/graph-schema";
import type { GraphNode } from "@terraform-viz/graph-schema";

function makeNode(overrides: Partial<GraphNode> & Pick<GraphNode, "address" | "type">): GraphNode {
  return {
    id: overrides.address,
    name: overrides.address.split(".")[1] ?? overrides.address,
    provider: CloudProvider.AWS,
    layer: ResourceLayer.COMPUTE,
    attributes: {},
    changeAction: ChangeAction.NO_OP,
    moduleAddress: null,
    ...overrides,
  };
}

function emptyFilter(): GraphFilter {
  return { actions: new Set(), layers: new Set(), providers: new Set(), search: "", tags: new Set() };
}

describe("getNodeTags", () => {
  it("returns empty array when no tags attribute", () => {
    const node = makeNode({ address: "aws_instance.a", type: "aws_instance", attributes: {} });
    expect(getNodeTags(node)).toEqual([]);
  });

  it("returns key:value pairs, excluding Name tag", () => {
    const node = makeNode({
      address: "aws_instance.a",
      type: "aws_instance",
      attributes: { tags: { Name: "my-instance", env: "prod", team: "platform" } },
    });
    const tags = getNodeTags(node);
    expect(tags).toContain("env:prod");
    expect(tags).toContain("team:platform");
    expect(tags).not.toContain("Name:my-instance");
  });

  it("returns empty array when tags is an array (not object)", () => {
    const node = makeNode({
      address: "aws_instance.a",
      type: "aws_instance",
      attributes: { tags: ["tag1", "tag2"] },
    });
    expect(getNodeTags(node)).toEqual([]);
  });

  it("handles nested tag objects (e.g. tags_all)", () => {
    const node = makeNode({
      address: "aws_s3_bucket.data",
      type: "aws_s3_bucket",
      attributes: { tags: { env: "staging", cost_center: "eng" } },
    });
    const tags = getNodeTags(node);
    expect(tags).toHaveLength(2);
    expect(tags).toContain("env:staging");
    expect(tags).toContain("cost_center:eng");
  });
});

describe("GraphFilter shape", () => {
  it("emptyFilter has correct zero-state", () => {
    const f = emptyFilter();
    expect(f.actions.size).toBe(0);
    expect(f.layers.size).toBe(0);
    expect(f.providers.size).toBe(0);
    expect(f.search).toBe("");
    expect(f.tags.size).toBe(0);
  });

  it("can add an action to filter set", () => {
    const f = emptyFilter();
    const updated: GraphFilter = { ...f, actions: new Set([ChangeAction.CREATE]) };
    expect(updated.actions.has(ChangeAction.CREATE)).toBe(true);
    expect(updated.actions.size).toBe(1);
  });

  it("can filter by multiple layers", () => {
    const f: GraphFilter = {
      ...emptyFilter(),
      layers: new Set([ResourceLayer.COMPUTE, ResourceLayer.NETWORK]),
    };
    expect(f.layers.has(ResourceLayer.COMPUTE)).toBe(true);
    expect(f.layers.has(ResourceLayer.NETWORK)).toBe(true);
    expect(f.layers.has(ResourceLayer.DATABASE)).toBe(false);
  });
});
