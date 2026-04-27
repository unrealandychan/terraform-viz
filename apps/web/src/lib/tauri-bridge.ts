/**
 * tauri-bridge.ts
 *
 * Thin adapter so the React UI can call Tauri IPC commands
 * instead of /api/* HTTP routes — with web fallback built in.
 *
 * Usage:
 *   import { parsePlan, openPlanFile, isTauri } from "@/lib/tauri-bridge";
 */

// Detect if running inside Tauri desktop or in a regular browser
export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// ── Parse Plan ────────────────────────────────────────────────────────────────

export async function parsePlan(raw: string): Promise<unknown> {
  if (isTauri) {
    return tauriInvoke("parse_plan", { raw });
  }
  // Web fallback — existing Next.js API route
  const res = await fetch("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(raw),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Open File (desktop only) ──────────────────────────────────────────────────

export async function openPlanFile(): Promise<string | null> {
  if (!isTauri) return null;
  return tauriInvoke<string | null>("open_plan_file");
}

// ── Estimate Costs ────────────────────────────────────────────────────────────

export async function estimateCosts(
  nodes: unknown[]
): Promise<unknown[]> {
  if (isTauri) {
    return tauriInvoke<unknown[]>("estimate_costs", { nodes });
  }
  // Web mode: pricing is done client-side already
  return nodes;
}
