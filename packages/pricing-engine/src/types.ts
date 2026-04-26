export interface CostEstimate {
  /** Estimated monthly USD cost, or null if unknown. */
  monthly: number | null;
  /** Human-readable label. */
  label: string;
  /** Annual estimate (monthly × 12), or null if unknown. */
  annual: number | null;
  /** Human-readable explanation of how the cost was computed. */
  breakdown: string | null;
}

export interface BreakdownItem {
  label: string;
  unitCost: number;
  quantity: number;
  unit: string;
}

/** Override per-resource usage parameters for cost estimation. */
export type UsageOverrides = Record<string, unknown>;
