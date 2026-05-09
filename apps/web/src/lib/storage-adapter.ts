/**
 * storage-adapter.ts
 *
 * A thin, typed wrapper around `localStorage` with consistent error handling.
 * All store modules (plan-store, baseline-store, theme-store, usage-utils)
 * should use these helpers instead of calling localStorage directly, so that
 * quota errors, SSR guards, and JSON parse failures are handled in one place.
 */

// ── SSR guard ─────────────────────────────────────────────────────────────────
function isAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Read and JSON-parse a value from localStorage.
 * Returns `null` on missing key, quota error, or parse failure.
 */
export function storageGet<T>(key: string): T | null {
  if (!isAvailable()) return null;
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Read a raw string value from localStorage (no JSON parsing).
 * Returns `null` if not available or key is missing.
 */
export function storageGetRaw(key: string): string | null {
  if (!isAvailable()) return null;
  return localStorage.getItem(key);
}

/**
 * JSON-serialize and write a value to localStorage.
 * Silently swallows QuotaExceededError — callers that need quota-aware
 * behaviour (e.g. plan-store) should check `isApproachingQuota()` first.
 *
 * @returns `true` on success, `false` on quota exceeded or SSR.
 */
export function storageSet<T>(key: string, value: T): boolean {
  if (!isAvailable()) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a raw string value to localStorage (no JSON serialization).
 *
 * @returns `true` on success, `false` on quota exceeded or SSR.
 */
export function storageSetRaw(key: string, value: string): boolean {
  if (!isAvailable()) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a key from localStorage. No-op if key does not exist or SSR.
 */
export function storageRemove(key: string): void {
  if (!isAvailable()) return;
  localStorage.removeItem(key);
}

// ── Quota estimation ──────────────────────────────────────────────────────────

const QUOTA_WARN_BYTES = 4 * 1024 * 1024; // 4 MB

/** Estimate total localStorage usage in bytes (UTF-16 × 2). */
export function estimateLocalStorageUsage(): number {
  if (!isAvailable()) return 0;
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) total += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
    return total * 2;
  } catch {
    return 0;
  }
}

/** Returns `true` when usage is above the 4 MB warning threshold. */
export function isApproachingQuota(): boolean {
  return estimateLocalStorageUsage() > QUOTA_WARN_BYTES;
}

/** Returns `true` when usage is above 125% of the warning threshold. */
export function isAtQuota(): boolean {
  return estimateLocalStorageUsage() > QUOTA_WARN_BYTES * 1.25;
}
