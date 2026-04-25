import type { CloudProvider } from "@terraform-viz/graph-schema";

export enum ConfidenceLevel {
  EXACT = "EXACT",
  ESTIMATED = "ESTIMATED",
  UNKNOWN = "UNKNOWN",
}

export interface ResourceEstimate {
  readonly nodeId: string;
  readonly resourceType: string;
  readonly resourceName: string;
  readonly monthlyCostUsd: number;
  readonly confidence: ConfidenceLevel;
  readonly breakdown: readonly CostLineItem[];
  readonly missingInputs: readonly string[];
}

export interface CostLineItem {
  readonly label: string;
  readonly unitCost: number;
  readonly quantity: number;
  readonly unit: string;
}

export interface PricingResult {
  readonly provider: CloudProvider;
  readonly estimatedAt: string;
  readonly resources: readonly ResourceEstimate[];
  readonly subtotalByLayer: Readonly<Record<string, number>>;
  readonly totalMonthlyCostUsd: number;
  readonly hasLowConfidenceEstimates: boolean;
}
