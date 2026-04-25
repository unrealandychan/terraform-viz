import type { GraphModel } from "@terraform-viz/graph-schema";

export const PLAN_STORAGE_KEY = "terraform-viz:plan";
export const HISTORY_STORAGE_KEY = "terraform-viz:history";
const MAX_HISTORY = 6;
const QUOTA_WARN_BYTES = 4 * 1024 * 1024; // warn at 4 MB

export class StorageQuotaError extends Error {
  constructor() {
    super("localStorage quota exceeded");
    this.name = "StorageQuotaError";
  }
}

export function estimateLocalStorageUsage(): number {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) total += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
    return total * 2; // UTF-16 chars = 2 bytes each
  } catch {
    return 0;
  }
}

export function isApproachingQuota(): boolean {
  return estimateLocalStorageUsage() > QUOTA_WARN_BYTES;
}

export function isAtQuota(): boolean {
  return estimateLocalStorageUsage() > QUOTA_WARN_BYTES * 1.25;
}

export interface PlanHistoryEntry {
  id: string;
  name: string;
  savedAt: string; // ISO 8601
  nodeCount: number;
  model: GraphModel;
}

export function savePlan(model: GraphModel): void {
  try {
    // Evict oldest history entry if at quota before saving
    if (isAtQuota()) {
      const history = loadHistory();
      if (history.length > 0) {
        const trimmed = history.slice(0, history.length - 1);
        try {
          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
        } catch {
          // ignore
        }
      }
    }
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(model));
  } catch {
    // quota exceeded — skip silently
  }
}

export function loadPlan(): GraphModel | null {
  // prefer localStorage, fall back to sessionStorage (legacy)
  const raw =
    localStorage.getItem(PLAN_STORAGE_KEY) ?? sessionStorage.getItem(PLAN_STORAGE_KEY);
  if (raw === null) return null;

  try {
    return JSON.parse(raw) as GraphModel;
  } catch {
    return null;
  }
}

export function clearPlan(): void {
  localStorage.removeItem(PLAN_STORAGE_KEY);
  sessionStorage.removeItem(PLAN_STORAGE_KEY);
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
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota exceeded — keep only most recent 2
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([entry, ...filtered].slice(0, 2)));
    } catch {
      // give up
    }
  }
}

export function loadHistory(): PlanHistoryEntry[] {
  const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PlanHistoryEntry[];
  } catch {
    return [];
  }
}

export function removeHistoryEntry(id: string): void {
  const next = loadHistory().filter((e) => e.id !== id);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
}
