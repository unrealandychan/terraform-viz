import { describe, it, expect } from "vitest";
import { diffPlans } from "../lib/plan-diff";
import { CloudProvider, ResourceLayer, ChangeAction } from "@terraform-viz/graph-schema";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";

let _idCounter = 0;
function makeNode(
  address: string,
  type = "aws_vpc",
  provider = CloudProvider.AWS,
): GraphNode {
  return {
    id: address,
    address,
    type,
    name: address.split(".").pop() ?? address,
    provider,
    layer: ResourceLayer.NETWORK,
    attributes: {},
    changeAction: ChangeAction.NO_OP,
    moduleAddress: null,
  };
}

function makeModel(nodes: GraphNode[]): GraphModel {
  return {
    id: `model-${++_idCounter}`,
    nodes,
    edges: [],
    terraformVersion: "1.5.0",
    createdAt: new Date().toISOString(),
  };
}

describe("diffPlans", () => {
  describe("counts", () => {
    it("returns all nodes as added when baseline is empty", () => {
      const current = makeModel([
        makeNode("aws_vpc.main"),
        makeNode("aws_subnet.a"),
      ]);
      const baseline = makeModel([]);

      const diff = diffPlans(current, baseline);

      expect(diff.addedCount).toBe(2);
      expect(diff.removedCount).toBe(0);
      expect(diff.unchangedCount).toBe(0);
    });

    it("returns all nodes as removed when current is empty", () => {
      const current = makeModel([]);
      const baseline = makeModel([
        makeNode("aws_vpc.main"),
        makeNode("aws_subnet.a"),
      ]);

      const diff = diffPlans(current, baseline);

      expect(diff.addedCount).toBe(0);
      expect(diff.removedCount).toBe(2);
      expect(diff.unchangedCount).toBe(0);
    });

    it("correctly classifies added, removed, and unchanged", () => {
      const current = makeModel([
        makeNode("aws_vpc.main"),    // in both
        makeNode("aws_subnet.new"),  // added
      ]);
      const baseline = makeModel([
        makeNode("aws_vpc.main"),         // in both
        makeNode("aws_subnet.removed"),   // removed
      ]);

      const diff = diffPlans(current, baseline);

      expect(diff.addedCount).toBe(1);
      expect(diff.removedCount).toBe(1);
      expect(diff.unchangedCount).toBe(1);
    });

    it("all unchanged when models are identical", () => {
      const nodes = [makeNode("aws_vpc.main"), makeNode("aws_instance.web", "aws_instance")];
      const diff = diffPlans(makeModel(nodes), makeModel(nodes));
      expect(diff.addedCount).toBe(0);
      expect(diff.removedCount).toBe(0);
      expect(diff.unchangedCount).toBe(2);
    });
  });

  describe("cost delta", () => {
    it("totalCostDelta is 0 when both models are identical free resources", () => {
      const nodes = [makeNode("aws_vpc.main"), makeNode("aws_subnet.a")];
      const diff = diffPlans(makeModel(nodes), makeModel(nodes));
      expect(diff.totalCostDelta).toBe(0);
    });

    it("totalCostDelta is positive when current has more expensive resources", () => {
      // aws_nat_gateway = $36.50, aws_vpc = $0
      const current = makeModel([makeNode("aws_nat_gateway.ngw", "aws_nat_gateway")]);
      const baseline = makeModel([makeNode("aws_vpc.main", "aws_vpc")]);

      const diff = diffPlans(current, baseline);

      expect(diff.totalCostDelta).toBeGreaterThan(0);
      expect(diff.currentMonthly).toBeCloseTo(36.5, 2);
      expect(diff.baselineMonthly).toBeCloseTo(0, 2);
    });

    it("totalCostDelta is negative when resources are removed", () => {
      const current = makeModel([]);
      const baseline = makeModel([makeNode("aws_nat_gateway.ngw", "aws_nat_gateway")]);

      const diff = diffPlans(current, baseline);

      expect(diff.totalCostDelta).toBeLessThan(0);
    });

    it("added node entries have costDelta equal to monthly cost", () => {
      const current = makeModel([makeNode("aws_nat_gateway.ngw", "aws_nat_gateway")]);
      const baseline = makeModel([]);

      const diff = diffPlans(current, baseline);
      const entry = diff.entries.find((e) => e.node.address === "aws_nat_gateway.ngw");

      expect(entry).toBeDefined();
      expect(entry?.kind).toBe("added");
      expect(entry?.costDelta).toBeCloseTo(36.5, 2);
    });

    it("removed node entries have negative costDelta", () => {
      const current = makeModel([]);
      const baseline = makeModel([makeNode("aws_nat_gateway.ngw", "aws_nat_gateway")]);

      const diff = diffPlans(current, baseline);
      const entry = diff.entries.find((e) => e.node.address === "aws_nat_gateway.ngw");

      expect(entry).toBeDefined();
      expect(entry?.kind).toBe("removed");
      expect(entry?.costDelta).toBeCloseTo(-36.5, 2);
    });

    it("free resources have costDelta of 0", () => {
      const current = makeModel([makeNode("aws_vpc.main", "aws_vpc")]);
      const baseline = makeModel([]);

      const diff = diffPlans(current, baseline);
      const entry = diff.entries.find((e) => e.node.address === "aws_vpc.main");

      expect(entry?.costDelta).toBe(0);
    });
  });

  describe("entries structure", () => {
    it("total entries count = added + removed + unchanged", () => {
      const current = makeModel([
        makeNode("aws_vpc.main"),
        makeNode("aws_subnet.new"),
      ]);
      const baseline = makeModel([
        makeNode("aws_vpc.main"),
        makeNode("aws_subnet.old"),
      ]);

      const diff = diffPlans(current, baseline);

      expect(diff.entries.length).toBe(diff.addedCount + diff.removedCount + diff.unchangedCount);
    });

    it("unchanged entry has kind 'unchanged'", () => {
      const node = makeNode("aws_vpc.main");
      const diff = diffPlans(makeModel([node]), makeModel([node]));
      const entry = diff.entries.find((e) => e.node.address === "aws_vpc.main");
      expect(entry?.kind).toBe("unchanged");
    });
  });
});
