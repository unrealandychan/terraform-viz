import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  savePlan, loadPlan, clearPlan, saveToHistory, loadHistory, removeHistoryEntry,
  PLAN_STORAGE_KEY, HISTORY_STORAGE_KEY,
} from "../lib/plan-store";
import type { GraphModel } from "@terraform-viz/graph-schema";

function makeModel(id = "test-1", nodeCount = 2): GraphModel {
  return {
    id,
    provider: "AWS",
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      id: `node-${i}`,
      type: "aws_instance",
      name: `instance-${i}`,
      provider: "AWS",
      layer: "compute",
      action: "create",
      attributes: {},
      dependencies: [],
    })),
    edges: [],
    metadata: { generatedAt: new Date().toISOString(), planHash: "abc123", workspaceRoot: "/" },
  };
}

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

// Also mock sessionStorage (used in clearPlan / loadPlan fallback)
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });
Object.defineProperty(globalThis, "sessionStorage", { value: sessionStorageMock });

beforeEach(() => {
  localStorageMock.clear();
  sessionStorageMock.clear();
  vi.clearAllMocks();
});

describe("plan-store", () => {
  describe("savePlan / loadPlan", () => {
    it("round-trips a GraphModel", () => {
      const m = makeModel();
      savePlan(m);
      const loaded = loadPlan();
      expect(loaded?.id).toBe(m.id);
      expect(loaded?.nodes).toHaveLength(m.nodes.length);
    });

    it("loadPlan returns null when nothing stored", () => {
      expect(loadPlan()).toBeNull();
    });

    it("loadPlan returns null for corrupted JSON", () => {
      localStorageMock.setItem(PLAN_STORAGE_KEY, "{broken");
      expect(loadPlan()).toBeNull();
    });
  });

  describe("clearPlan", () => {
    it("removes the plan from storage", () => {
      savePlan(makeModel());
      clearPlan();
      expect(loadPlan()).toBeNull();
    });
  });

  describe("history", () => {
    it("saveToHistory adds an entry", () => {
      saveToHistory(makeModel("h1"), "Plan 1");
      const h = loadHistory();
      expect(h).toHaveLength(1);
      expect(h[0].name).toBe("Plan 1");
    });

    it("history caps at MAX_HISTORY (6)", () => {
      for (let i = 0; i < 8; i++) saveToHistory(makeModel(`m${i}`), `Plan ${i}`);
      expect(loadHistory()).toHaveLength(6);
    });

    it("deduplicates by model.id", () => {
      const m = makeModel("same-id");
      saveToHistory(m, "First");
      saveToHistory(m, "Second");
      const h = loadHistory();
      expect(h).toHaveLength(1);
      expect(h[0].name).toBe("Second");
    });

    it("removeHistoryEntry removes by id", () => {
      saveToHistory(makeModel("a"), "A");
      saveToHistory(makeModel("b"), "B");
      const h = loadHistory();
      removeHistoryEntry(h[0].id);
      const h2 = loadHistory();
      expect(h2).toHaveLength(1);
    });

    it("loadHistory returns [] for corrupted JSON", () => {
      localStorageMock.setItem(HISTORY_STORAGE_KEY, "[bad");
      expect(loadHistory()).toEqual([]);
    });
  });
});
