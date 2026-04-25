export enum RecommendationCategory {
  COST_CUT = "COST_CUT",
  PERFORMANCE = "PERFORMANCE",
  RELIABILITY = "RELIABILITY",
  SECURITY = "SECURITY",
}

export enum RecommendationSource {
  PRICING_DATA = "PRICING_DATA",
  TERRAFORM_DIFF = "TERRAFORM_DIFF",
  ARCHITECTURAL_HEURISTIC = "ARCHITECTURAL_HEURISTIC",
}

export enum RecommendationSeverity {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export interface Recommendation {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: RecommendationCategory;
  readonly source: RecommendationSource;
  readonly severity: RecommendationSeverity;
  readonly affectedResources: readonly string[];
  readonly estimatedMonthlySavingsUsd: number | null;
}

export interface RecommendationResult {
  readonly generatedAt: string;
  readonly recommendations: readonly Recommendation[];
  readonly llmProviderUsed: string | null;
}
