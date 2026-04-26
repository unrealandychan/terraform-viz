"use client";

import { useState, useEffect, useCallback, useMemo, useTransition } from "react";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";
import { TwoDGraph } from "@/components/graph/TwoDGraph";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { NodeDetail } from "@/components/graph/NodeDetail";
import { CostBreakdown } from "@/components/graph/CostBreakdown";
import { CompareView } from "@/components/graph/CompareView";
import { DiffView } from "@/components/graph/DiffView";
import { GraphFilterBar, getNodeTags, type GraphFilter } from "@/components/graph/GraphFilterBar";
import { GraphToolbar } from "@/components/graph/GraphToolbar";
import { loadPlan, savePlan, saveToHistory, loadHistory, type PlanHistoryEntry } from "@/lib/plan-store";
import { saveBaseline, loadBaseline, clearBaseline, type BaselineEntry } from "@/lib/baseline-store";
import { diffPlans, type PlanDiff } from "@/lib/plan-diff";
import { decodePlan, PLAN_URL_PARAM } from "@/lib/plan-url";
import { DEMO_PLAN } from "@/lib/demo-plan";
import { SIMPLE_STATIC_SITE } from "@/lib/example-simple";
import { SERVERLESS_API } from "@/lib/example-serverless";
import { ENTERPRISE_MIGRATION } from "@/lib/example-enterprise";
import { MULTI_CLOUD_PLATFORM } from "@/lib/example-multicloud";
import { useUsageStore } from "@/stores/useUsageStore";
import { useUIStore } from "@/stores/useUIStore";

const DETAIL_KEY = "tf-viz:panel:detail";
const MIN_DETAIL = 220;
const MAX_DETAIL = 560;
const DEFAULT_DETAIL = 296;

export default function GraphPage() {
  const [model, setModel] = useState<GraphModel | null>(null);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const selectedNode = useUIStore((s) => s.selectedNode);
  const setSelectedNode = useUIStore((s) => s.setSelectedNode);
  const chatOpen = useUIStore((s) => s.isChatOpen);
  const setChatOpen = useUIStore((s) => s.setChatOpen);
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const usageOverrides = useUsageStore((s) => s.overrides);
  const [detailW, setDetailW] = useState(DEFAULT_DETAIL);
  const [filter, setFilter] = useState<GraphFilter>({
    actions: new Set(),
    layers: new Set(),
    providers: new Set(),
    search: "",
    tags: new Set(),
  });

  const filteredModel = useMemo<GraphModel | null>(() => {
    if (!model) return null;
    const { actions, layers, providers, search, tags } = filter;
    if (actions.size === 0 && layers.size === 0 && providers.size === 0 && tags.size === 0 && !search) return model;
    const nodes = model.nodes.filter((n) => {
      if (actions.size > 0 && !actions.has(n.changeAction)) return false;
      if (layers.size > 0 && !layers.has(n.layer)) return false;
      if (providers.size > 0 && !providers.has(n.provider)) return false;
      if (tags.size > 0 && !getNodeTags(n).some((t) => tags.has(t))) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!n.name.toLowerCase().includes(q) && !n.type.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = model.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
    return { ...model, nodes, edges };
  }, [model, filter]);

  useEffect(() => {
    const stored = localStorage.getItem(DETAIL_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (!isNaN(n) && n >= MIN_DETAIL && n <= MAX_DETAIL) setDetailW(n);
    }
  }, []);

  const handleDetailResize = useCallback((delta: number) => {
    setDetailW((prev) => {
      const next = Math.min(MAX_DETAIL, Math.max(MIN_DETAIL, prev + delta));
      localStorage.setItem(DETAIL_KEY, String(Math.round(next)));
      return next;
    });
  }, []);

  const [history, setHistory] = useState<PlanHistoryEntry[]>([]);
  const [baseline, setBaseline] = useState<BaselineEntry | null>(null);
  const [, startBaselineTransition] = useTransition();

  const diff = useMemo<PlanDiff | null>(() => {
    if (!model || !baseline || viewMode !== "diff") return null;
    return diffPlans(model, baseline.model);
  }, [model, baseline, viewMode]);

  useEffect(() => {
    setBaseline(loadBaseline());
    const params = new URLSearchParams(window.location.search);
    const planParam = params.get(PLAN_URL_PARAM);
    if (planParam) {
      decodePlan(planParam)
        .then((decoded) => {
          savePlan(decoded);
          saveToHistory(decoded, "Shared Plan");
          setModel(decoded);
          setHistory(loadHistory());
          const url = new URL(window.location.href);
          url.searchParams.delete(PLAN_URL_PARAM);
          window.history.replaceState({}, "", url.toString());
        })
        .catch(console.error);
    } else {
      setModel(loadPlan());
      setHistory(loadHistory());
    }
  }, []);

  const loadFromHistory = useCallback((entry: PlanHistoryEntry) => {
    savePlan(entry.model);
    setModel(entry.model);
    setFilter({ actions: new Set(), layers: new Set(), providers: new Set(), search: "", tags: new Set() });
  }, []);

  const handlePinBaseline = useCallback((entry: PlanHistoryEntry) => {
    setTimeout(() => saveBaseline(entry.name, entry.model), 0);
    startBaselineTransition(() => {
      setBaseline({ name: entry.name, savedAt: new Date().toISOString(), nodeCount: entry.model.nodes.length, model: entry.model });
    });
  }, [startBaselineTransition]);

  const handleUnpinBaseline = useCallback(() => {
    clearBaseline();
    startBaselineTransition(() => {
      setBaseline(null);
      if (viewMode === "diff") setViewMode("2d");
    });
  }, [startBaselineTransition, viewMode, setViewMode]);

  const loadExample = useCallback((plan: GraphModel) => {
    savePlan(plan);
    setModel(plan);
    setFilter({ actions: new Set(), layers: new Set(), providers: new Set(), search: "", tags: new Set() });
  }, []);

  const handleNodeSelect = useCallback((node: GraphNode) => {
    setSelectedNode(node);
  }, [setSelectedNode]);

  if (model === null) {
    return (
      <div className="graph-empty">
        <div className="graph-empty__icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </div>
        <p className="graph-empty__title">No plan loaded</p>
        <p className="graph-empty__desc">
          Upload a Terraform plan JSON to generate an interactive infrastructure graph.
        </p>
        <div className="graph-empty__actions">
          <a href="/upload" className="btn btn--primary">
            Upload a plan
          </a>
        </div>
        <div className="graph-empty__examples">
          <p className="graph-empty__examples-title">Or load an example:</p>
          <div className="graph-empty__examples-grid">
            {([
              { label: "Demo Overview",        desc: "25 resources · all layers", plan: DEMO_PLAN },
              { label: "Static Website",       desc: "8 resources · S3 + CloudFront + Route53", plan: SIMPLE_STATIC_SITE },
              { label: "Serverless API",       desc: "14 resources · Lambda + API GW + DynamoDB", plan: SERVERLESS_API },
              { label: "Enterprise Migration", desc: "30 resources · EC2 → ECS + MySQL → Aurora", plan: ENTERPRISE_MIGRATION },
              { label: "Multi-Cloud Platform", desc: "22 resources · AWS + GCP + Azure", plan: MULTI_CLOUD_PLATFORM },
            ] as const).map(({ label, desc, plan }) => (
              <button
                key={label}
                className="graph-empty__example-card"
                onClick={() => loadExample(plan)}
              >
                <span className="graph-empty__example-label">{label}</span>
                <span className="graph-empty__example-desc">{desc}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="graph-empty__legend">
          <span className="graph-empty__legend-title">Change indicators:</span>
          {([
            ["#22c55e", "+", "Create"],
            ["#f59e0b", "~", "Update"],
            ["#f97316", "±", "Replace"],
            ["#ef4444", "−", "Delete"],
            ["#64748b", "=", "No-op"],
          ] as const).map(([color, sym, lbl]) => (
            <span key={lbl} className="graph-empty__legend-item">
              <span className="graph-empty__legend-badge" style={{ background: color }}>{sym}</span>
              {lbl}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="graph-page">
      <GraphToolbar
        model={model}
        history={history}
        baseline={baseline}
        onLoadFromHistory={loadFromHistory}
        onPinBaseline={handlePinBaseline}
        onUnpinBaseline={handleUnpinBaseline}
      />

      {filteredModel !== null && (
        <GraphFilterBar
          filter={filter}
          model={model}
          filteredCount={filteredModel.nodes.length}
          onChange={setFilter}
        />
      )}

      {baseline !== null && (
        <div className="graph-baseline-banner">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
          </svg>
          <span className="graph-baseline-banner__label">Baseline:</span>
          <strong className="graph-baseline-banner__name">{baseline.name}</strong>
          <span className="graph-baseline-banner__meta">
            {baseline.nodeCount} resource{baseline.nodeCount !== 1 ? "s" : ""}
            {" · "}pinned {new Date(baseline.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          <div className="graph-baseline-banner__actions">
            {viewMode !== "diff" && (
              <button className="btn btn--secondary graph-baseline-banner__diff-btn" onClick={() => setViewMode("diff")}>
                View Diff
              </button>
            )}
            <button className="btn btn--ghost graph-baseline-banner__unpin-btn" onClick={handleUnpinBaseline}>
              Unpin
            </button>
          </div>
        </div>
      )}

      <div className="graph-page__canvas-area">
        <div className="graph-page__canvas">
          {viewMode === "diff" && diff !== null ? (
            <DiffView
              diff={diff}
              baselineName={baseline!.name}
              onNodeSelect={handleNodeSelect}
            />
          ) : viewMode === "2d" ? (
            <TwoDGraph model={filteredModel ?? model} onNodeSelect={handleNodeSelect} usageOverrides={usageOverrides} />
          ) : (
            <CompareView model={filteredModel ?? model} onNodeSelect={handleNodeSelect} />
          )}
        </div>

        {(selectedNode !== null || activeTab === "cost" || chatOpen) && (
          <>
            <ResizeHandle
              onResize={handleDetailResize}
              direction="rtl"
              className="resize-handle--detail"
            />
            <div className="graph-page__right-panel" style={{ width: detailW, flexShrink: 0 }}>
              {/* Tabs */}
              <div className="graph-page__panel-tabs">
                <button
                  className={`graph-page__panel-tab${activeTab === "cost" ? " graph-page__panel-tab--active" : ""}`}
                  onClick={() => setActiveTab("cost")}
                >
                  💰 Cost
                </button>
                {selectedNode !== null && (
                  <button
                    className={`graph-page__panel-tab${activeTab === "detail" ? " graph-page__panel-tab--active" : ""}`}
                    onClick={() => setActiveTab("detail")}
                  >
                    Detail
                  </button>
                )}
                {chatOpen && (
                  <button
                    className={`graph-page__panel-tab${activeTab === "chat" ? " graph-page__panel-tab--active" : ""}`}
                    onClick={() => setActiveTab("chat")}
                  >
                    AI Chat
                  </button>
                )}
                <button
                  className="graph-page__panel-close"
                  onClick={() => {
                    if (activeTab === "chat") { setChatOpen(false); setActiveTab("cost"); }
                    else if (activeTab === "detail") { setSelectedNode(null); setActiveTab("cost"); }
                  }}
                  aria-label="Close panel"
                >
                  ✕
                </button>
              </div>

              {/* Panel content */}
              {activeTab === "cost" && (
                <CostBreakdown
                  model={filteredModel ?? model}
                />
              )}
              {activeTab === "detail" && selectedNode !== null && (
                <NodeDetail node={selectedNode} />
              )}
              {activeTab === "chat" && chatOpen && (
                <ChatPanel
                  nodeContext={selectedNode}
                  plan={model}
                  compact
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
