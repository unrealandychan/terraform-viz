"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { ResizeHandle } from "./ResizeHandle";

const SIDEBAR_KEY = "tf-viz:panel:sidebar";
const MIN_SIDEBAR = 160;
const MAX_SIDEBAR = 420;
const DEFAULT_SIDEBAR = 220;

export default function ClientShell({ children }: { children: ReactNode }) {
  const [sidebarW, setSidebarW] = useState(DEFAULT_SIDEBAR);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (!isNaN(n) && n >= MIN_SIDEBAR && n <= MAX_SIDEBAR) setSidebarW(n);
    }
  }, []);

  const handleResize = useCallback((delta: number) => {
    setSidebarW((prev) => {
      const next = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, prev + delta));
      localStorage.setItem(SIDEBAR_KEY, String(Math.round(next)));
      return next;
    });
  }, []);

  return (
    <div
      className="app-shell"
      style={{ "--sidebar-width": `${sidebarW}px` } as React.CSSProperties}
    >
      <Sidebar />
      <ResizeHandle onResize={handleResize} className="resize-handle--sidebar" />
      <main className="app-content">{children}</main>
    </div>
  );
}
