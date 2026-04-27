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
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// ── Parse Plan ────────────────────────────────────────────────────────────────

export async function parsePlan(raw: string): Promise<unknown> {
  if (isTauri()) {
    // Tauri backend expects JSON string — Rust side parses it
    return tauriInvoke("parse_plan", { raw });
  }
  // Web fallback — existing Next.js API route
  const parsed: unknown = JSON.parse(raw);
  const res = await fetch("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(typeof err["error"] === "string" ? err["error"] : "Parse failed");
  }
  return res.json();
}

// ── Open File (desktop only) ──────────────────────────────────────────────────

export interface OpenedFile {
  content: string;
  fileName: string;
}

/**
 * Opens a native file picker (Tauri only).
 * Returns { content, fileName } or null if user cancelled.
 */
export async function openPlanFile(): Promise<OpenedFile | null> {
  if (!isTauri()) return null;
  // Rust IPC: open_plan_file() -> Option<String> (JSON-encoded { content, file_name })
  const result = await tauriInvoke<{ content: string; file_name: string } | null>("open_plan_file");
  if (!result) return null;
  return {
    content: result.content,
    fileName: result.file_name,
  };
}

// ── Estimate Costs ────────────────────────────────────────────────────────────

export async function estimateCosts(
  nodes: unknown[]
): Promise<unknown[]> {
  if (isTauri()) {
    return tauriInvoke<unknown[]>("estimate_costs", { nodes });
  }
  // Web mode: pricing is done client-side already
  return nodes;
}
