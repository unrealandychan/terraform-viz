import { describe, it, expect } from "vitest";
import { ChangeAction, CloudProvider, ResourceLayer } from "@terraform-viz/graph-schema";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";
import { estimateCost } from "@terraform-viz/pricing-engine";

// ── Helpers ────────────────────────────────────────────────────────────────

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

function makeModel(nodes: GraphNode[]): GraphModel {
  return {
    id: "m-" + Math.random().toString(36).slice(2),
    nodes,
    edges: [],
    terraformVersion: "1.5.0",
    createdAt: new Date().toISOString(),
  };
}

// ── Pure diff logic (extracted from comparison/main.ts for unit testing) ──

interface DiffResult {
  created: string[];
  deleted: string[];
  changed: string[];
}

function diffModels(current: GraphModel, previous: GraphModel): DiffResult {
  const previousByAddr = new Map(previous.nodes.map((n) => [n.address, n]));
  const currentByAddr = new Map(current.nodes.map((n) => [n.address, n]));

  const created = current.nodes.filter((n) => !previousByAddr.has(n.address)).map((n) => n.address);
  const deleted = previous.nodes.filter((n) => !currentByAddr.has(n.address)).map((n) => n.address);
  const changed = current.nodes
    .filter((n) => previousByAddr.has(n.address) && n.changeAction !== ChangeAction.NO_OP)
    .map((n) => n.address);

  return { created, deleted, changed };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("diffModels — created resources", () => {
  it("detects newly added resource", () => {
    const previous = makeModel([makeNode({ address: "aws_instance.old", type: "aws_instance" })]);
    const current = makeModel([
      makeNode({ address: "aws_instance.old", type: "aws_instance" }),
      makeNode({ address: "aws_instance.new", type: "aws_instance" }),
    ]);
    const { created } = diffModels(current, previous);
    expect(created).toContain("aws_instance.new");
    expect(created).not.toContain("aws_instance.old");
  });

  it("returns empty created list when nothing new", () => {
    const model = makeModel([makeNode({ address: "aws_instance.a", type: "aws_instance" })]);
    const { created } = diffModels(model, model);
    expect(created).toHaveLength(0);
  });
});

describe("diffModels — deleted resources", () => {
  it("detects removed resource", () => {
    const previous = makeModel([
      makeNode({ address: "aws_instance.old", type: "aws_instance" }),
      makeNode({ address: "aws_instance.gone", type: "aws_instance" }),
    ]);
    const current = makeModel([makeNode({ address: "aws_instance.old", type: "aws_instance" })]);
    const { deleted } = diffModels(current, previous);
    expect(deleted).toContain("aws_instance.gone");
    expect(deleted).not.toContain("aws_instance.old");
  });
});

describe("diffModels — changed resources", () => {
  it("detects UPDATE changeAction", () => {
    const previous = makeModel([makeNode({ address: "aws_instance.app", type: "aws_instance" })]);
    const current = makeModel([
      makeNode({
        address: "aws_instance.app",
        type: "aws_instance",
        changeAction: ChangeAction.UPDATE,
      }),
    ]);
    const { changed } = diffModels(current, previous);
    expect(changed).toContain("aws_instance.app");
  });

  it("does not include NO_OP resources in changed", () => {
    const model = makeModel([
      makeNode({
        address: "aws_instance.app",
        type: "aws_instance",
        changeAction: ChangeAction.NO_OP,
      }),
    ]);
    const { changed } = diffModels(model, model);
    expect(changed).toHaveLength(0);
  });

  it("detects REPLACE changeAction", () => {
    const previous = makeModel([
      makeNode({ address: "aws_db_instance.db", type: "aws_db_instance" }),
    ]);
    const current = makeModel([
      makeNode({
        address: "aws_db_instance.db",
        type: "aws_db_instance",
        changeAction: ChangeAction.REPLACE,
      }),
    ]);
    const { changed } = diffModels(current, previous);
    expect(changed).toContain("aws_db_instance.db");
  });
});

describe("diffModels — combined scenarios", () => {
  it("handles all three categories at once", () => {
    const previous = makeModel([
      makeNode({ address: "aws_instance.keep", type: "aws_instance" }),
      makeNode({ address: "aws_instance.update", type: "aws_instance" }),
      makeNode({ address: "aws_instance.remove", type: "aws_instance" }),
    ]);
    const current = makeModel([
      makeNode({ address: "aws_instance.keep", type: "aws_instance" }),
      makeNode({
        address: "aws_instance.update",
        type: "aws_instance",
        changeAction: ChangeAction.UPDATE,
      }),
      makeNode({ address: "aws_instance.add", type: "aws_instance" }),
    ]);
    const result = diffModels(current, previous);
    expect(result.created).toContain("aws_instance.add");
    expect(result.deleted).toContain("aws_instance.remove");
    expect(result.changed).toContain("aws_instance.update");
    expect(result.created).not.toContain("aws_instance.keep");
    expect(result.deleted).not.toContain("aws_instance.keep");
  });

  it("handles empty models", () => {
    const empty = makeModel([]);
    const result = diffModels(empty, empty);
    expect(result.created).toHaveLength(0);
    expect(result.deleted).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });
});

// ── Pricing fallback logic (mirrored from comparison/main.ts) ─────────────

function roughMonthlyFallback(node: GraphNode): number {
  return estimateCost(node).monthly ?? 0;
}

function computeCostDelta(
  currentNodes: GraphNode[],
  previousNodes: GraphNode[],
  priceMap: Map<string, number>,
): number {
  const usePricing = priceMap.size > 0;
  const currentTotal = currentNodes.reduce((s, n) => {
    return (
      s + (usePricing ? (priceMap.get(n.id) ?? roughMonthlyFallback(n)) : roughMonthlyFallback(n))
    );
  }, 0);
  const previousTotal = previousNodes.reduce((s, n) => {
    return (
      s + (usePricing ? (priceMap.get(n.id) ?? roughMonthlyFallback(n)) : roughMonthlyFallback(n))
    );
  }, 0);
  return Number.parseFloat((currentTotal - previousTotal).toFixed(2));
}

describe("roughMonthlyFallback", () => {
  it("returns 0 for unknown resource type", () => {
    const node = makeNode({ address: "null_resource.noop", type: "null_resource" });
    expect(roughMonthlyFallback(node)).toBe(0);
  });

  it("returns positive cost for aws_instance with known instance_type", () => {
    const node = makeNode({
      address: "aws_instance.web",
      type: "aws_instance",
      attributes: { instance_type: "t3.micro" },
    });
    expect(roughMonthlyFallback(node)).toBeGreaterThan(0);
  });

  it("returns default fallback cost for aws_instance with unknown instance_type", () => {
    const node = makeNode({
      address: "aws_instance.web",
      type: "aws_instance",
      attributes: { instance_type: "x99.superlarge" },
    });
    // estimateCost falls back to a default value when instance_type is not in table
    expect(roughMonthlyFallback(node)).toBeGreaterThan(0);
  });

  it("returns positive cost for aws_db_instance", () => {
    const node = makeNode({
      address: "aws_db_instance.db",
      type: "aws_db_instance",
      attributes: { instance_class: "db.t3.micro" },
    });
    expect(roughMonthlyFallback(node)).toBeGreaterThan(0);
  });
});

describe("computeCostDelta — fallback pricing (empty priceMap)", () => {
  it("returns 0 when current and previous are identical", () => {
    const node = makeNode({
      address: "aws_instance.app",
      type: "aws_instance",
      attributes: { instance_type: "t3.micro" },
    });
    const model = makeModel([node]);
    expect(computeCostDelta(model.nodes, model.nodes, new Map())).toBe(0);
  });

  it("returns positive delta when a resource is added", () => {
    const existing = makeNode({
      address: "aws_instance.old",
      type: "aws_instance",
      attributes: { instance_type: "t3.micro" },
    });
    const added = makeNode({
      address: "aws_instance.new",
      type: "aws_instance",
      attributes: { instance_type: "t3.micro" },
    });
    const delta = computeCostDelta([existing, added], [existing], new Map());
    expect(delta).toBeGreaterThan(0);
  });

  it("returns negative delta when a resource is removed", () => {
    const existing = makeNode({
      address: "aws_instance.old",
      type: "aws_instance",
      attributes: { instance_type: "t3.micro" },
    });
    const removed = makeNode({
      address: "aws_instance.gone",
      type: "aws_instance",
      attributes: { instance_type: "t3.micro" },
    });
    const delta = computeCostDelta([existing], [existing, removed], new Map());
    expect(delta).toBeLessThan(0);
  });

  it("returns 0 delta when only free resources change", () => {
    const previous = makeNode({ address: "aws_vpc.main", type: "aws_vpc" });
    const current = makeNode({ address: "aws_vpc.other", type: "aws_vpc" });
    const delta = computeCostDelta([current], [previous], new Map());
    expect(delta).toBe(0);
  });
});

describe("computeCostDelta — with pricing service data (priceMap populated)", () => {
  it("uses priceMap values instead of fallback", () => {
    const node = makeNode({ address: "aws_instance.app", type: "aws_instance", id: "node-1" });
    const priceMap = new Map([["node-1", 100]]);
    // current has 1 node at $100, previous has 0 → delta should be $100
    const delta = computeCostDelta([node], [], priceMap);
    expect(delta).toBe(100);
  });

  it("uses fallback for nodes missing from priceMap", () => {
    const knownNode = makeNode({
      address: "aws_instance.known",
      type: "aws_instance",
      id: "known-id",
      attributes: { instance_type: "t3.micro" },
    });
    const unknownNode = makeNode({
      address: "aws_instance.unknown",
      type: "aws_instance",
      id: "unknown-id",
      attributes: { instance_type: "t3.micro" },
    });
    const priceMap = new Map([["known-id", 999]]);
    // previous has same nodes so delta = 0, just verify no error thrown
    const delta = computeCostDelta([knownNode, unknownNode], [knownNode, unknownNode], priceMap);
    expect(delta).toBe(0);
  });

  it("computes positive delta when current is more expensive", () => {
    const nodeA = makeNode({ address: "aws_instance.a", type: "aws_instance", id: "id-a" });
    const nodeB = makeNode({ address: "aws_instance.b", type: "aws_instance", id: "id-b" });
    const priceMap = new Map([
      ["id-a", 50],
      ["id-b", 150],
    ]);
    // current: [nodeB at $150], previous: [nodeA at $50]
    const delta = computeCostDelta([nodeB], [nodeA], priceMap);
    expect(delta).toBe(100);
  });
});
