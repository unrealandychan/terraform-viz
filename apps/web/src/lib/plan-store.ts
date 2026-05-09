import type { GraphModel } from "@terraform-viz/graph-schema";
import {
  storageGet,
  storageSet,
  storageRemove,
  isAtQuota,
} from "./storage-adapter";

export { isApproachingQuota, estimateLocalStorageUsage } from "./storage-adapter";

export const PLAN_STORAGE_KEY    = "terraform-viz:plan";
export const HISTORY_STORAGE_KEY = "terraform-viz:history";
const MAX_HISTORY = 6;

export class StorageQuotaError extends Error {
  constructor() {
    super("localStorage quota exceeded");
    this.name = "StorageQuotaError";
  }
}

export interface PlanHistoryEntry {
  id: string;
  name: string;
  savedAt: string; // ISO 8601
  nodeCount: number;
  model: GraphModel;
}

export function savePlan(model: GraphModel): void {
  // Evict oldest history entry if at quota before saving
  if (isAtQuota()) {
    const history = loadHistory();
    if (history.length > 0) {
      storageSet(HISTORY_STORAGE_KEY, history.slice(0, history.length - 1));
    }
  }
  storageSet(PLAN_STORAGE_KEY, model);
}

export function loadPlan(): GraphModel | null {
  // prefer localStorage, fall back to sessionStorage (legacy)
  const fromLocal = storageGet<GraphModel>(PLAN_STORAGE_KEY);
  if (fromLocal !== null) return fromLocal;

  // legacy sessionStorage fallback
  const raw = typeof sessionStorage !== "undefined"
    ? sessionStorage.getItem(PLAN_STORAGE_KEY)
    : null;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GraphModel;
  } catch {
    return null;
  }
}

export function clearPlan(): void {
  storageRemove(PLAN_STORAGE_KEY);
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(PLAN_STORAGE_KEY);
  }
}

export function saveToHistory(model: GraphModel, name: string): void {
  const history = loadHistory();
  const entry: PlanHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    savedAt: new Date().toISOString(),
    nodeCount: model.nodes.length,
    model,
  };
  // deduplicate: drop any older entry that has the same model id
  const filtered = history.filter((e) => e.model.id !== model.id);
  const next = [entry, ...filtered].slice(0, MAX_HISTORY);

  if (!storageSet(HISTORY_STORAGE_KEY, next)) {
    // quota exceeded — keep only most recent 2
    storageSet(HISTORY_STORAGE_KEY, [entry, ...filtered].slice(0, 2));
  }
}

export function loadHistory(): PlanHistoryEntry[] {
  return storageGet<PlanHistoryEntry[]>(HISTORY_STORAGE_KEY) ?? [];
}

export function removeHistoryEntry(id: string): void {
  storageSet(HISTORY_STORAGE_KEY, loadHistory().filter((e) => e.id !== id));
}
