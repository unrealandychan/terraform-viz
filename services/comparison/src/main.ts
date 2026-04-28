import express, { type Request, type Response as ExpressResponse } from "express";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";
import { ChangeAction } from "@terraform-viz/graph-schema";
import { estimateCost } from "@terraform-viz/pricing-engine";
import { z } from "zod";

const PORT = Number(process.env["PORT"] ?? 3003);
const PRICING_URL = process.env["PRICING_URL"] ?? "http://localhost:3002";

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs}ms`);
    throw error;
  }
}

const app = express();
app.use(express.json({ limit: "20mb" }));

app.get("/health", (_request: Request, response: ExpressResponse): void => {
  response.json({ status: "ok", service: "comparison" });
});

function roughMonthlyFallback(node: GraphNode): number {
  return estimateCost(node).monthly ?? 0;
}

// ── Call pricing service for accurate cost estimates ─────────────────────────
async function estimateViaPricingService(nodes: GraphNode[]): Promise<Map<string, number>> {
  try {
    const fakeModel = { nodes, edges: [] };
    const res = await fetchWithTimeout(`${PRICING_URL}/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: fakeModel }),
    }, 10_000);
    if (!res.ok) throw new Error(`pricing service error: ${res.status}`);
    const data = await res.json() as { resources: Array<{ nodeId: string; monthlyCostUsd: number }> };
    const map = new Map<string, number>();
    for (const r of data.resources) map.set(r.nodeId, r.monthlyCostUsd);
    return map;
  } catch {
    // Pricing service unavailable — caller will use fallback
    return new Map();
  }
}

const graphModelSchema = z.object({ nodes: z.array(z.unknown()), edges: z.array(z.unknown()).optional() });
const diffSchema = z.object({ current: graphModelSchema, previous: graphModelSchema });

// POST /diff
// Body: { current: GraphModel; previous: GraphModel }
app.post("/diff", (request: Request, response: ExpressResponse): void => {
  const parsed = diffSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Validation failed", details: parsed.error });
    return;
  }
  const body = request.body as { current?: GraphModel; previous?: GraphModel };

  if (!body.current || !body.previous) {
    response.status(400).json({ error: "Both current and previous plan models are required" });
    return;
  }

  const previousByAddr = new Map(body.previous.nodes.map((n) => [n.address, n]));
  const currentByAddr = new Map(body.current.nodes.map((n) => [n.address, n]));

  const created = body.current.nodes.filter((n) => !previousByAddr.has(n.address)).map((n) => n.address);
  const deleted = body.previous.nodes.filter((n) => !currentByAddr.has(n.address)).map((n) => n.address);
  const changed = body.current.nodes
    .filter((n) => previousByAddr.has(n.address) && n.changeAction !== ChangeAction.NO_OP)
    .map((n) => n.address);

  const allNodes = [...body.current.nodes, ...body.previous.nodes];

  void estimateViaPricingService(allNodes).then((priceMap) => {
    const usePricing = priceMap.size > 0;

    const currentTotal = body.current!.nodes.reduce((s, n) => {
      return s + (usePricing ? (priceMap.get(n.id) ?? roughMonthlyFallback(n)) : roughMonthlyFallback(n));
    }, 0);
    const previousTotal = body.previous!.nodes.reduce((s, n) => {
      return s + (usePricing ? (priceMap.get(n.id) ?? roughMonthlyFallback(n)) : roughMonthlyFallback(n));
    }, 0);
    const costDeltaUsd = Number.parseFloat((currentTotal - previousTotal).toFixed(2));

    response.json({
      createdAt: new Date().toISOString(),
      created,
      changed,
      deleted,
      replaced: [],
      costDeltaUsd,
      summary: `+${created.length} added, ~${changed.length} changed, -${deleted.length} removed · $${costDeltaUsd >= 0 ? "+" : ""}${costDeltaUsd}/mo`,
    });
  });
});

app.listen(PORT, () => {
  process.stdout.write(`[comparison] listening on port ${PORT}\n`);
});
