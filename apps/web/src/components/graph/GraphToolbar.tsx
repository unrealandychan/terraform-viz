"use client";

import { useRef, useEffect, useState, useCallback, memo } from "react";
import type { GraphModel } from "@terraform-viz/graph-schema";
import type { PlanHistoryEntry } from "@/lib/plan-store";
import type { BaselineEntry } from "@/lib/baseline-store";
import { encodePlan } from "@/lib/plan-url";
import { estimateCost } from "@/lib/pricing-estimates";
import { useUIStore } from "@/stores/useUIStore";

export const GraphToolbar = memo(function GraphToolbar({
  model,
  history,
  baseline,
  onLoadFromHistory,
  onPinBaseline,
  onUnpinBaseline,
}: {
  model: GraphModel;
  history: PlanHistoryEntry[];
  baseline: BaselineEntry | null;
  onLoadFromHistory: (entry: PlanHistoryEntry) => void;
  onPinBaseline: (entry: PlanHistoryEntry) => void;
  onUnpinBaseline: () => void;
}) {
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const chatOpen = useUIStore((s) => s.isChatOpen);
  const setChatOpen = useUIStore((s) => s.setChatOpen);
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  const historyWrapRef = useRef<HTMLDivElement>(null);
  const exportWrapRef = useRef<HTMLDivElement>(null);

  // close dropdowns on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (historyWrapRef.current && !historyWrapRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
      if (exportWrapRef.current && !exportWrapRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const exportShareURL = useCallback(async () => {
    try {
      const encoded = await encodePlan(model);
      const url = `${window.location.origin}${window.location.pathname}?plan=${encoded}`;
      await navigator.clipboard.writeText(url);
      setShareUrlCopied(true);
      setTimeout(() => setShareUrlCopied(false), 2000);
    } catch (e) {
      console.error("Share URL failed:", e);
    }
    setExportOpen(false);
  }, [model]);

  const exportSVG = useCallback(() => {
    const svgEl = document.querySelector<SVGSVGElement>(".graph-page__canvas svg");
    if (!svgEl) return;
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("width", "100%");
    rect.setAttribute("height", "100%");
    rect.setAttribute("fill", "#0f1117");
    clone.insertBefore(rect, clone.firstChild);
    const serializer = new XMLSerializer();
    const blob = new Blob([serializer.serializeToString(clone)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `terraform-graph.svg`; a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, []);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `terraform-plan.json`; a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [model]);

  const exportCSV = useCallback(() => {
    const header = ["Name", "Type", "Provider", "Action", "Layer", "Monthly Cost (USD)"];
    const rowsData = model.nodes.map((n) => {
      const c = estimateCost(n);
      return [n.name, n.type, n.provider, n.changeAction, n.layer, c.monthly !== null ? c.monthly.toFixed(2) : ""];
    });
    const csv = [header, ...rowsData].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `terraform-costs.csv`; a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [model]);

  return (
    <div className="graph-page__toolbar">
      <div className="graph-page__view-toggle">
        <button
          className={`btn ${viewMode === "2d" ? "btn--primary" : "btn--secondary"}`}
          onClick={() => setViewMode("2d")}
        >
          Graph
        </button>
        <button
          className={`btn ${viewMode === "compare" ? "btn--primary" : "btn--secondary"}`}
          onClick={() => setViewMode("compare")}
        >
          Compare
        </button>
        {baseline !== null && (
          <button
            className={`btn ${viewMode === "diff" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setViewMode(viewMode === "diff" ? "2d" : "diff")}
            title="Plan vs. baseline diff"
          >
            Diff
          </button>
        )}
      </div>

      <div className="graph-page__toolbar-right">
        {/* Cost panel toggle */}
        <button
          className={`btn ${activeTab === "cost" && !chatOpen ? "btn--primary" : "btn--secondary"}`}
          onClick={() => { setActiveTab("cost"); setChatOpen(false); }}
          title="Cost breakdown"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
          Cost
        </button>

        <div className="graph-page__toolbar-divider" />

        {/* AI Chat */}
        <button
          className={`btn ${chatOpen ? "btn--primary" : "btn--secondary"} graph-page__ai-btn`}
          onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) setActiveTab("chat"); }}
          title="Toggle AI Chat"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          AI Chat
        </button>

        {/* Export */}
        <div className="graph-export__wrap" ref={exportWrapRef}>
          <button
            className={`btn btn--secondary graph-export__btn${exportOpen ? " graph-export__btn--open" : ""}`}
            onClick={() => setExportOpen((o) => !o)}
            title="Export"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 1 }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {exportOpen && (
            <div className="graph-export__dropdown">
              <div className="graph-export__title">Export as</div>
              {viewMode === "2d" && (
                <button className="graph-export__item" onClick={exportSVG}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M8 12h8M12 8v8" />
                  </svg>
                  <span>
                    <strong>Graph SVG</strong>
                    <small>Vector image of the architecture diagram</small>
                  </span>
                </button>
              )}
              <button className="graph-export__item" onClick={exportJSON}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span>
                  <strong>Plan JSON</strong>
                  <small>Full parsed plan model</small>
                </span>
              </button>
              <button className="graph-export__item" onClick={exportCSV}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                  <line x1="8" y1="17" x2="16" y2="17" />
                </svg>
                <span>
                  <strong>Cost CSV</strong>
                  <small>Resource list with monthly estimates</small>
                </span>
              </button>
              <button className="graph-export__item" onClick={exportShareURL}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                <span>
                  <strong>{shareUrlCopied ? "Copied!" : "Share URL"}</strong>
                  <small>Copy link with plan embedded</small>
                </span>
              </button>
            </div>
          )}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="graph-history__wrap" ref={historyWrapRef}>
            <button
              className={`btn btn--secondary graph-history__btn${historyOpen ? " graph-history__btn--open" : ""}`}
              onClick={() => setHistoryOpen((o) => !o)}
              title="Recent plans"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              History
              <span className="graph-history__count">{history.length}</span>
            </button>
            {historyOpen && (
              <div className="graph-history__dropdown">
                <div className="graph-history__title">Recent plans</div>
                {history.map((entry) => {
                  const isPinned =
                    baseline !== null &&
                    baseline.model.id === entry.model.id;
                  return (
                    <div key={entry.id} className="graph-history__item">
                      <button
                        className="graph-history__item-main"
                        onClick={() => { onLoadFromHistory(entry); setHistoryOpen(false); }}
                      >
                        <span className="graph-history__item-name">{entry.name}</span>
                        <span className="graph-history__item-meta">
                          {entry.nodeCount} resource{entry.nodeCount !== 1 ? "s" : ""}
                          {" · "}
                          {new Date(entry.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </button>
                      <button
                        className={`graph-history__item-pin${isPinned ? " graph-history__item-pin--active" : ""}`}
                        onClick={() => isPinned ? onUnpinBaseline() : onPinBaseline(entry)}
                        title={isPinned ? "Unpin baseline" : "Pin as baseline for diff"}
                        aria-label={isPinned ? "Unpin baseline" : "Pin as baseline"}
                      >
                        📌
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
