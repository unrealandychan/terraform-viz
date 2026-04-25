// Usage overrides: stored per nodeId in localStorage
// Does NOT mutate the original plan

const STORAGE_KEY = "terraform-viz:usage-overrides";

export type UsageOverrides = Record<string, Record<string, number>>;
// { [nodeId]: { _usage_requests_m: 5, _usage_memory_mb: 512, ... } }

export function loadUsageOverrides(): UsageOverrides {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as UsageOverrides;
  } catch { return {}; }
}

export function saveUsageOverride(nodeId: string, key: string, value: number): void {
  const all = loadUsageOverrides();
  all[nodeId] = { ...(all[nodeId] ?? {}), [key]: value };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function resetUsageOverride(nodeId: string): void {
  const all = loadUsageOverrides();
  delete all[nodeId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function resetAllUsageOverrides(): void {
  localStorage.setItem(STORAGE_KEY, "{}");
}

export function applyUsageOverrides(
  attributes: Record<string, unknown>,
  overrides: Record<string, number> | undefined
): Record<string, unknown> {
  if (!overrides) return attributes;
  return { ...attributes, ...overrides };
}
