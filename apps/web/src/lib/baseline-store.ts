import type { GraphModel } from "@terraform-viz/graph-schema";
import { storageGet, storageSet, storageRemove } from "./storage-adapter";

const BASELINE_KEY = "terraform-viz:baseline";

export interface BaselineEntry {
  name: string;
  savedAt: string;
  nodeCount: number;
  model: GraphModel;
}

export function saveBaseline(name: string, model: GraphModel): void {
  const entry: BaselineEntry = {
    name,
    savedAt: new Date().toISOString(),
    nodeCount: model.nodes.length,
    model,
  };
  storageSet(BASELINE_KEY, entry);
}

export function loadBaseline(): BaselineEntry | null {
  return storageGet<BaselineEntry>(BASELINE_KEY);
}

export function clearBaseline(): void {
  storageRemove(BASELINE_KEY);
}
