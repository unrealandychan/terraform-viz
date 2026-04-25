import type { GraphModel } from "@terraform-viz/graph-schema";

const BASELINE_KEY = "terraform-viz:baseline";

export interface BaselineEntry {
  name: string;
  savedAt: string;
  nodeCount: number;
  model: GraphModel;
}

export function saveBaseline(name: string, model: GraphModel): void {
  try {
    const entry: BaselineEntry = {
      name,
      savedAt: new Date().toISOString(),
      nodeCount: model.nodes.length,
      model,
    };
    localStorage.setItem(BASELINE_KEY, JSON.stringify(entry));
  } catch {
    // storage quota exceeded — ignore
  }
}

export function loadBaseline(): BaselineEntry | null {
  const raw = localStorage.getItem(BASELINE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BaselineEntry;
  } catch {
    return null;
  }
}

export function clearBaseline(): void {
  localStorage.removeItem(BASELINE_KEY);
}
