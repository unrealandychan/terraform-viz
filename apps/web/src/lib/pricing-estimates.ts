/**
 * Re-exports from the shared @terraform-viz/pricing-engine package.
 * All pricing logic lives in packages/pricing-engine — edit there, not here.
 */
export { estimateCost, totalMonthlyCost, costByProvider } from "@terraform-viz/pricing-engine";
export type { CostEstimate, BreakdownItem, UsageOverrides } from "@terraform-viz/pricing-engine";
