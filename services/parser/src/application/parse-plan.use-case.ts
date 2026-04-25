import type { GraphModel } from "@terraform-viz/graph-schema";
import { buildGraphModel } from "../domain/plan-parser.js";
import type { TerraformPlan } from "../domain/terraform-plan.types.js";

export type ParsePlanResult =
  | { readonly success: true; readonly data: GraphModel }
  | { readonly success: false; readonly error: string };

function isTerraformPlan(value: unknown): value is TerraformPlan {
  if (typeof value !== "object" || value === null) return false;
  const plan = value as Record<string, unknown>;
  const hasVersion =
    typeof plan["format_version"] === "string" &&
    typeof plan["terraform_version"] === "string";
  const hasModule = plan["planned_values"] !== undefined || plan["values"] !== undefined;
  return hasVersion && hasModule;
}

export function parsePlanUseCase(rawJson: unknown): ParsePlanResult {
  if (!isTerraformPlan(rawJson)) {
    return {
      success: false,
      error: "Invalid Terraform plan: missing format_version, terraform_version, or root module",
    };
  }

  try {
    const data = buildGraphModel(rawJson);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse Terraform plan";
    return { success: false, error: message };
  }
}
