import type { GraphModel } from "@terraform-viz/graph-schema";

const PARSER_URL = process.env["PARSER_URL"] ?? "http://localhost:3001";
const PRICING_URL = process.env["PRICING_URL"] ?? "http://localhost:3002";
const COMPARISON_URL = process.env["COMPARISON_URL"] ?? "http://localhost:3003";
const LLM_URL = process.env["LLM_URL"] ?? "http://localhost:3004";
const WORKER_URL = process.env["WORKER_URL"] ?? "http://localhost:3005";

export { PARSER_URL, PRICING_URL, COMPARISON_URL, LLM_URL, WORKER_URL };

export type ApiResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };

export async function parsePlan(planJson: unknown): Promise<ApiResult<GraphModel>> {
  try {
    const response = await fetch(`${PARSER_URL}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(planJson),
    });

    const body: unknown = await response.json();

    if (!response.ok) {
      const errorBody = body as Record<string, unknown>;
      return {
        success: false,
        error: typeof errorBody["error"] === "string" ? errorBody["error"] : "Parse failed",
      };
    }

    return { success: true, data: body as GraphModel };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return { success: false, error: message };
  }
}

/**
 * Send a base64-encoded zip archive to the Terraform worker, which runs
 * `terraform init + plan + show -json`, then parses the resulting plan into
 * a GraphModel via the parser service.
 */
export async function runPlan(
  archiveBase64: string,
  vars?: string[],
): Promise<ApiResult<GraphModel>> {
  let planJson: unknown;
  try {
    const workerRes = await fetch(`${WORKER_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archiveBase64, vars }),
    });

    const workerBody: unknown = await workerRes.json();

    if (!workerRes.ok) {
      const errBody = workerBody as Record<string, unknown>;
      return {
        success: false,
        error: typeof errBody["error"] === "string" ? errBody["error"] : `Worker error ${workerRes.status}`,
      };
    }

    planJson = (workerBody as Record<string, unknown>)["plan"];
    if (!planJson) {
      return { success: false, error: "Worker returned no plan JSON" };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker connection failed";
    return { success: false, error: message };
  }

  return parsePlan(planJson);
}
