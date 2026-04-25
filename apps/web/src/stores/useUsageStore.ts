import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UsageOverrides } from "@/lib/usage-store";

interface UsageState {
  overrides: UsageOverrides;
  setOverride: (nodeId: string, key: string, value: number) => void;
  resetNode: (nodeId: string) => void;
  resetAll: () => void;
  getNodeOverrides: (nodeId: string) => Record<string, number> | undefined;
  customizedCount: () => number;
}

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      overrides: {},

      setOverride: (nodeId, key, value) =>
        set((state) => ({
          overrides: {
            ...state.overrides,
            [nodeId]: { ...(state.overrides[nodeId] ?? {}), [key]: value },
          },
        })),

      resetNode: (nodeId) =>
        set((state) => {
          const next = { ...state.overrides };
          delete next[nodeId];
          return { overrides: next };
        }),

      resetAll: () => set({ overrides: {} }),

      getNodeOverrides: (nodeId) => get().overrides[nodeId],

      customizedCount: () =>
        Object.values(get().overrides).filter((o) => Object.keys(o).length > 0).length,
    }),
    {
      name: "terraform-viz:usage-overrides",
    }
  )
);
