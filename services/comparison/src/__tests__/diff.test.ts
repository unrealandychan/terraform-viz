import { describe, it, expect } from "vitest";
import { ChangeAction, CloudProvider, ResourceLayer } from "@terraform-viz/graph-schema";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";

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
      makeNode({ address: "aws_instance.app", type: "aws_instance", changeAction: ChangeAction.UPDATE }),
    ]);
    const { changed } = diffModels(current, previous);
    expect(changed).toContain("aws_instance.app");
  });

  it("does not include NO_OP resources in changed", () => {
    const model = makeModel([makeNode({ address: "aws_instance.app", type: "aws_instance", changeAction: ChangeAction.NO_OP })]);
    const { changed } = diffModels(model, model);
    expect(changed).toHaveLength(0);
  });

  it("detects REPLACE changeAction", () => {
    const previous = makeModel([makeNode({ address: "aws_db_instance.db", type: "aws_db_instance" })]);
    const current = makeModel([
      makeNode({ address: "aws_db_instance.db", type: "aws_db_instance", changeAction: ChangeAction.REPLACE }),
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
      makeNode({ address: "aws_instance.update", type: "aws_instance", changeAction: ChangeAction.UPDATE }),
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
