import type { GraphNode } from "@terraform-viz/graph-schema";
import { CloudProvider } from "@terraform-viz/graph-schema";
import type { CostEstimate } from "./types.js";
import { COST_TABLE, BREAKDOWN_TABLE } from "./cost-table.js";

export function estimateCost(node: GraphNode): CostEstimate {
  const function_ = COST_TABLE[node.type];
  if (!function_) return { monthly: null, label: "Unknown", annual: null, breakdown: null };
  const attributes = node.attributes as Record<string, unknown>;
  const monthly = function_(attributes);
  const bfn = BREAKDOWN_TABLE[node.type];
  const breakdown = bfn ? bfn(attributes) : null;
  const label = monthly === 0 ? "$0 (free)" : `$${monthly.toFixed(2)}/mo`;
  return { monthly, label, annual: monthly === 0 ? 0 : monthly * 12, breakdown };
}

/** Total estimated monthly cost across all nodes in a model. */
export function totalMonthlyCost(nodes: readonly GraphNode[]): number {
  return nodes.reduce((sum, n) => {
    const { monthly } = estimateCost(n);
    return sum + (monthly ?? 0);
  }, 0);
}

/** Per-cloud-provider monthly cost breakdown. Only includes providers with >0 known cost. */
export function costByProvider(nodes: readonly GraphNode[]): Array<{ provider: CloudProvider; monthly: number }> {
  const totals: Partial<Record<CloudProvider, number>> = {};
  for (const node of nodes) {
    const { monthly } = estimateCost(node);
    if (monthly === null) continue;
    totals[node.provider] = (totals[node.provider] ?? 0) + monthly;
  }
  return (Object.entries(totals) as [CloudProvider, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([provider, monthly]) => ({ provider, monthly }));
}
