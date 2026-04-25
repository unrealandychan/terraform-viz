import { create } from "zustand";
import type { GraphNode } from "@terraform-viz/graph-schema";

type ViewMode = "2d" | "compare" | "diff";
type ActiveTab = "cost" | "detail" | "chat";

interface UIState {
  selectedNode: GraphNode | null;
  activeTab: ActiveTab;
  viewMode: ViewMode;
  isChatOpen: boolean;
  setSelectedNode: (node: GraphNode | null) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setViewMode: (mode: ViewMode) => void;
  setChatOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  selectedNode: null,
  activeTab: "cost",
  viewMode: "2d",
  isChatOpen: false,
  setSelectedNode: (node) =>
    set({ selectedNode: node, activeTab: node ? "detail" : "cost" }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setChatOpen: (open) =>
    set((state) => ({
      isChatOpen: open,
      activeTab: open ? "chat" : state.activeTab,
    })),
}));
