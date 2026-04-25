import express, { type Request, type Response } from "express";
import type { GraphModel } from "@terraform-viz/graph-schema";
import type { PricingResult } from "@terraform-viz/pricing-types";
import { readFile } from "fs/promises";
import { join } from "path";

const PORT = Number(process.env["PORT"] ?? 3002);
const CATALOG_DIR = process.env["CATALOG_DIR"] ?? join(process.cwd(), "../../pricing/data");

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req: Request, response: Response): void => {
  response.json({ status: "ok", service: "pricing" });
});

// POST /estimate
// Body: { model: GraphModel }
// Returns: PricingResult
// TODO (M2): implement full pricing logic using catalog JSON files
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

  // Stub response — returns zero estimates until M2 is implemented
  const result: PricingResult = {
    provider: (body.model.nodes[0]?.provider ?? "UNKNOWN") as PricingResult["provider"],
    estimatedAt: new Date().toISOString(),
    resources: [],
    subtotalByLayer: {},
    totalMonthlyCostUsd: 0,
    hasLowConfidenceEstimates: false,
  };

  response.json(result);
});

app.listen(PORT, () => {
  process.stdout.write(`[pricing] listening on port ${PORT}\n`);
});
