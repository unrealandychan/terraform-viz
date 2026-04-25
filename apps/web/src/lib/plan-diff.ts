import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";
import { estimateCost } from "./pricing-estimates";

export type DiffKind = "added" | "removed" | "unchanged";

export interface NodeDiffEntry {
  kind: DiffKind;
  /** Current node (for "added" / "unchanged"), baseline node (for "removed") */
  node: GraphNode;
  /** Monthly cost delta in USD. null = neither side has pricing data. */
  costDelta: number | null;
}

export interface PlanDiff {
  entries: NodeDiffEntry[];
  /** Sum of all cost deltas (current total - baseline total) */
  totalCostDelta: number;
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
  currentMonthly: number;
  baselineMonthly: number;
}

/**
 * Compute a structural + cost diff between two plan models.
 * Uses node `address` as the stable cross-plan identifier.
 */
export function diffPlans(current: GraphModel, baseline: GraphModel): PlanDiff {
  const baselineByAddr = new Map(baseline.nodes.map((n) => [n.address, n]));
  const currentByAddr = new Map(current.nodes.map((n) => [n.address, n]));

  const entries: NodeDiffEntry[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let unchangedCount = 0;

  const currentMonthly = current.nodes.reduce(
    (s, n) => s + (estimateCost(n).monthly ?? 0),
    0,
  );
  const baselineMonthly = baseline.nodes.reduce(
    (s, n) => s + (estimateCost(n).monthly ?? 0),
    0,
  );
  const totalCostDelta = currentMonthly - baselineMonthly;

  for (const node of current.nodes) {
    const baseNode = baselineByAddr.get(node.address);
    const currCost = estimateCost(node).monthly;

    if (!baseNode) {
      // Resource is new in this plan
      entries.push({ kind: "added", node, costDelta: currCost });
      addedCount++;
    } else {
      // Resource exists in both plans — show cost change
      const baseCost = estimateCost(baseNode).monthly;
      let costDelta: number | null = null;
      if (currCost !== null || baseCost !== null) {
        costDelta = (currCost ?? 0) - (baseCost ?? 0);
      }
      entries.push({ kind: "unchanged", node, costDelta });
      unchangedCount++;
    }
  }

  for (const node of baseline.nodes) {
    if (!currentByAddr.has(node.address)) {
      // Resource was removed in current plan
      const cost = estimateCost(node).monthly;
      entries.push({ kind: "removed", node, costDelta: cost !== null ? -cost : null });
      removedCount++;
    }
  }

  return {
    entries,
    totalCostDelta,
    addedCount,
    removedCount,
    unchangedCount,
    currentMonthly,
    baselineMonthly,
  };
}
