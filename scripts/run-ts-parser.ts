/**
 * Runs the TS buildGraphModel on all example files and outputs
 * a JSON array of { file, nodeCount, nodeIds, edgeCount, edges }
 * for comparison with the Rust parser.
 *
 * Usage: npx tsx scripts/run-ts-parser.ts > src-tauri/tests/golden-ts-expected.json
 */
import { buildGraphModel } from "../services/parser/src/domain/plan-parser.js";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { TerraformPlan } from "../services/parser/src/domain/terraform-plan.types.js";

const examplesDirectory = resolve("examples");
const files = readdirSync(examplesDirectory).filter((file) => file.endsWith(".json"));

const results: Record<string, unknown>[] = [];

for (const file of files.sort()) {
  const raw = readFileSync(join(examplesDirectory, file), "utf8");
  try {
    const plan = JSON.parse(raw) as TerraformPlan;
    const model = buildGraphModel(plan);
    results.push({
      file,
      nodeCount: model.nodes.length,
      nodeIds: model.nodes.map((node) => node.id).sort(),
      edgeCount: model.edges.length,
      edges: model.edges.map((edge) => `${edge.source} -> ${edge.target}`).sort(),
    });
  } catch (error: unknown) {
    results.push({ file, error: String(error) });
  }
}

process.stdout.write(JSON.stringify(results, undefined, 2));
