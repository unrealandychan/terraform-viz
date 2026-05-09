// Usage overrides: stored per nodeId in localStorage
// Does NOT mutate the original plan.
// Use useUsageStore (Zustand) for all React state management.

import { storageGet, storageSet } from "./storage-adapter";

const STORAGE_KEY = "terraform-viz:usage-overrides";

export type UsageOverrides = Record<string, Record<string, number>>;
// { [nodeId]: { _usage_requests_m: 5, _usage_memory_mb: 512, ... } }

export function loadUsageOverrides(): UsageOverrides {
  return storageGet<UsageOverrides>(STORAGE_KEY) ?? {};
}

export function saveUsageOverride(nodeId: string, key: string, value: number): void {
  const all = loadUsageOverrides();
  all[nodeId] = { ...(all[nodeId] ?? {}), [key]: value };
  storageSet(STORAGE_KEY, all);
}

export function resetUsageOverride(nodeId: string): void {
  const all = loadUsageOverrides();
  delete all[nodeId];
  storageSet(STORAGE_KEY, all);
}

export function resetAllUsageOverrides(): void {
  storageSet(STORAGE_KEY, {});
}

export function applyUsageOverrides(
  attributes: Record<string, unknown>,
  overrides: Record<string, number> | undefined
): Record<string, unknown> {
  if (!overrides) return attributes;
  return { ...attributes, ...overrides };
}
