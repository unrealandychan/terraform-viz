import express, { type Request, type Response } from "express";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";
import { ConfidenceLevel, type PricingResult, type ResourceEstimate } from "@terraform-viz/pricing-types";
import { readFile } from "fs/promises";
import { join } from "path";

const PORT = Number(process.env["PORT"] ?? 3002);
const CATALOG_DIR = process.env["CATALOG_DIR"] ?? join(process.cwd(), "../../pricing/data");

const app = express();
app.use(express.json({ limit: "10mb" }));

import { COST_TABLE, BREAKDOWN_TABLE } from "@terraform-viz/pricing-engine";

function estimateNode(node: GraphNode): { monthlyCostUsd: number; breakdown: string; confidence: ConfidenceLevel } {
  const fn = COST_TABLE[node.type];
  const attrs = (node.attributes ?? {}) as Record<string, unknown>;
  if (!fn) {
    return { monthlyCostUsd: 0, breakdown: "unknown resource type — defaulting to $0", confidence: ConfidenceLevel.UNKNOWN };
  }
  const monthlyCostUsd = fn(attrs);
  const bfn = BREAKDOWN_TABLE[node.type];
  const breakdown = bfn ? bfn(attrs) : (monthlyCostUsd === 0 ? "free" : "est.");
  return { monthlyCostUsd, breakdown, confidence: ConfidenceLevel.ESTIMATED };
}

app.get("/health", (_req: Request, response: Response): void => {
  response.json({ status: "ok", service: "pricing" });
});

// POST /estimate
// Body: { model: GraphModel }
// Returns: PricingResult
app.post("/estimate", async (request: Request, response: Response): Promise<void> => {
  const body = request.body as { model?: GraphModel };
  if (!body.model) {
    response.status(400).json({ error: "Missing model in request body" });
    return;
  }

  try {
    const catalogPath = join(CATALOG_DIR, "aws.json");
    await readFile(catalogPath, "utf-8");
  } catch {
    // Catalog may not exist yet in development
  }

  const model = body.model;
  const resources: ResourceEstimate[] = model.nodes.map((node) => {
    const { monthlyCostUsd, breakdown, confidence } = estimateNode(node);
    return {
      nodeId: node.id,
      resourceType: node.type,
      resourceName: node.name ?? node.id,
      monthlyCostUsd,
      breakdown: [{ label: breakdown, unitCost: monthlyCostUsd, quantity: 1, unit: "mo" }],
      confidence,
      missingInputs: [],
    };
  });

  const totalMonthlyCostUsd = resources.reduce((sum, r) => sum + r.monthlyCostUsd, 0);
  const hasLowConfidenceEstimates = resources.some((r) => r.confidence === ConfidenceLevel.UNKNOWN);

  const subtotalByLayer: Record<string, number> = {};
  for (const node of model.nodes) {
    const layer = node.layer ?? "unknown";
    const cost = resources.find((r) => r.nodeId === node.id)?.monthlyCostUsd ?? 0;
    subtotalByLayer[layer] = (subtotalByLayer[layer] ?? 0) + cost;
  }

  const result: PricingResult = {
    provider: (model.nodes[0]?.provider ?? "UNKNOWN") as PricingResult["provider"],
    estimatedAt: new Date().toISOString(),
    resources,
    subtotalByLayer,
    totalMonthlyCostUsd,
    hasLowConfidenceEstimates,
  };

  response.json(result);
});

app.listen(PORT, () => {
  process.stdout.write(`[pricing] listening on port ${PORT}\n`);
});
