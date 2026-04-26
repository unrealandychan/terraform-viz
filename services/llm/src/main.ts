import express, { type Request, type Response } from "express";
import OpenAI from "openai";
import type { GraphModel } from "@terraform-viz/graph-schema";
import { ResourceLayer } from "@terraform-viz/graph-schema";
import { z } from "zod";
import {
  RecommendationCategory,
  RecommendationSeverity,
  RecommendationSource,
  type Recommendation,
  type RecommendationResult,
} from "@terraform-viz/llm-types";
import { randomUUID } from "crypto";
import { runDeterministicRules } from "./rules.js";

const PORT = Number(process.env["PORT"] ?? 3004);
const LLM_PROVIDER = process.env["LLM_PROVIDER"] ?? "openai";
const ENV_API_KEY = process.env["OPENAI_API_KEY"];
const ENV_BASE_URL = process.env["OPENAI_BASE_URL"]; // e.g. http://localhost:11434/v1
const ENV_MODEL = process.env["LLM_MODEL"] ?? "gpt-4o-mini";

const app = express();
app.use(express.json({ limit: "10mb" }));

// Build an OpenAI client from env vars or per-request overrides.
function buildClient(apiKey?: string, baseUrl?: string): OpenAI | null {
  const key = apiKey ?? ENV_API_KEY;
  if (!key || LLM_PROVIDER !== "openai") return null;
  return new OpenAI({
    apiKey: key,
    baseURL: baseUrl ?? ENV_BASE_URL, // undefined = use OpenAI default
  });
}

async function callLlm(
  client: OpenAI,
  model: string,
  prompt: string,
): Promise<string | null> {
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
      temperature: 0.3,
    });
    return completion.choices[0]?.message.content ?? null;
  } catch {
    return null;
  }
}

function buildPrompt(graphModel: GraphModel, rules: Recommendation[]): string {
  const layerCounts = Object.values(ResourceLayer)
    .map((l) => `${l}: ${graphModel.nodes.filter((n) => n.layer === l).length}`)
    .join(", ");
  const rulesSummary =
    rules.length > 0
      ? rules.map((r) => `- ${r.title} (${r.severity})`).join("\n")
      : "None";

  const resourceList = graphModel.nodes
    .slice(0, 30)
    .map((n) => {
      const attrs: string[] = [];
      if (n.attributes["instance_type"]) attrs.push(`instance_type=${String(n.attributes["instance_type"])}`);
      if (n.attributes["engine"]) attrs.push(`engine=${String(n.attributes["engine"])}`);
      if (n.attributes["encrypted"] !== undefined) attrs.push(`encrypted=${String(n.attributes["encrypted"])}`);
      if (n.attributes["publicly_accessible"] !== undefined) attrs.push(`publicly_accessible=${String(n.attributes["publicly_accessible"])}`);
      if (n.attributes["acl"]) attrs.push(`acl=${String(n.attributes["acl"])}`);
      return `  - ${n.type} "${n.name}"${attrs.length ? " (" + attrs.join(", ") + ")" : ""}`;
    })
    .join("\n");

  return (
    `You are a Terraform infrastructure expert. Analyze the following plan summary and ` +
    `provide 2-3 concise, actionable recommendations for reliability, cost, or security.\n\n` +
    `Resources by layer: ${layerCounts}\n` +
    `Total resources: ${graphModel.nodes.length}\n` +
    `Terraform version: ${graphModel.terraformVersion}\n\n` +
    `Resource details:\n${resourceList}\n\n` +
    `Rule-based issues already detected:\n${rulesSummary}\n\n` +
    `Respond in plain text with bullet points. Be specific and brief.`
  );
}

app.get("/health", (_req: Request, response: Response): void => {
  response.json({ status: "ok", service: "llm" });
});

const recommendSchema = z.object({
  model: z.object({ nodes: z.array(z.unknown()) }),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  llmModel: z.string().optional(),
});

// POST /recommend
// Body: { model: GraphModel; apiKey?: string; baseUrl?: string; llmModel?: string }
// Returns: RecommendationResult
app.post("/recommend", (request: Request, response: Response): void => {
  const parsed = recommendSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Validation failed", details: parsed.error.errors });
    return;
  }
  const body = request.body as {
    model?: GraphModel;
    apiKey?: string;
    baseUrl?: string;
    llmModel?: string;
  };

  if (!body.model) {
    response.status(400).json({ error: "Missing model in request body" });
    return;
  }

  const deterministicRecs = runDeterministicRules(body.model);
  const client = buildClient(body.apiKey, body.baseUrl);
  const model = body.llmModel ?? ENV_MODEL;

  const finalize = (llmSummary: string | null): void => {
    const recommendations =
      llmSummary !== null
        ? [
            {
              id: randomUUID(),
              title: "AI Analysis",
              description: llmSummary,
              category: RecommendationCategory.RELIABILITY,
              source: RecommendationSource.ARCHITECTURAL_HEURISTIC,
              severity: RecommendationSeverity.LOW,
              affectedResources: [] as string[],
              estimatedMonthlySavingsUsd: null,
            },
            ...deterministicRecs,
          ]
        : deterministicRecs;

    const result: RecommendationResult = {
      generatedAt: new Date().toISOString(),
      recommendations,
      llmProviderUsed: llmSummary !== null ? LLM_PROVIDER : null,
    };
    response.json(result);
  };

  if (client !== null) {
    const prompt = buildPrompt(body.model, deterministicRecs);
    void callLlm(client, model, prompt).then(finalize);
  } else {
    finalize(null);
  }
});

app.listen(PORT, () => {
  process.stdout.write(`[llm] listening on port ${PORT}\n`);
});
