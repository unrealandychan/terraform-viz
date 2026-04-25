"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useTransition, memo, type ChangeEvent } from "react";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";
import { ChangeAction, CloudProvider, ResourceLayer } from "@terraform-viz/graph-schema";
import { TwoDGraph } from "@/components/graph/TwoDGraph";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { loadPlan, savePlan, saveToHistory, loadHistory, type PlanHistoryEntry } from "@/lib/plan-store";
import { estimateCost, costByProvider } from "@/lib/pricing-estimates";
import { saveBaseline, loadBaseline, clearBaseline, type BaselineEntry } from "@/lib/baseline-store";
import { diffPlans, type PlanDiff, type DiffKind } from "@/lib/plan-diff";
import { encodePlan, decodePlan, PLAN_URL_PARAM } from "@/lib/plan-url";
import { DEMO_PLAN } from "@/lib/demo-plan";
import { SIMPLE_STATIC_SITE } from "@/lib/example-simple";
import { SERVERLESS_API } from "@/lib/example-serverless";
import { ENTERPRISE_MIGRATION } from "@/lib/example-enterprise";
import { MULTI_CLOUD_PLATFORM } from "@/lib/example-multicloud";

const DETAIL_KEY = "tf-viz:panel:detail";
const MIN_DETAIL = 220;
const MAX_DETAIL = 560;
const DEFAULT_DETAIL = 296;

type ViewMode = "2d" | "compare" | "diff";
type PanelTab = "detail" | "chat" | "cost";

const CHANGE_ACTION_LABELS: Record<ChangeAction, string> = {
  [ChangeAction.CREATE]: "create",
  [ChangeAction.UPDATE]: "update",
  [ChangeAction.DELETE]: "delete",
  [ChangeAction.REPLACE]: "replace",
  [ChangeAction.NO_OP]: "no-op",
};

const LAYER_LABELS: Record<ResourceLayer, string> = {
  [ResourceLayer.NETWORK]: "network",
  [ResourceLayer.COMPUTE]: "compute",
  [ResourceLayer.DATABASE]: "database",
  [ResourceLayer.STORAGE]: "storage",
  [ResourceLayer.DATA]: "data",
  [ResourceLayer.UNKNOWN]: "unknown",
};

const NodeDetail = memo(function NodeDetail({ node }: { node: GraphNode }) {
  const { monthly, annual, breakdown } = estimateCost(node);

  return (
    <aside className="node-detail">
      <h3 className="node-detail__title">{node.name}</h3>
      <p className="node-detail__type">{node.type}</p>
      <div className="node-detail__badges">
        <span className={`layer-badge layer-badge--${LAYER_LABELS[node.layer]}`}>
          {LAYER_LABELS[node.layer]}
        </span>
        <span className="node-detail__action">{CHANGE_ACTION_LABELS[node.changeAction]}</span>
        <span className={`provider-badge provider-badge--${node.provider.toLowerCase()}`}>
          {node.provider}
        </span>
      </div>

      {/* Pricing section */}
      <div className="node-detail__sep" />
      <div className="node-detail__pricing">
        <div className="node-detail__pricing-header">Estimated Cost</div>
        <div className="node-detail__pricing-amount">
          {monthly === null ? "—" : monthly === 0 ? "Free" : `$${monthly.toFixed(2)}`}
          {monthly !== null && monthly > 0 && (
            <span className="node-detail__pricing-unit">/month</span>
          )}
        </div>
        {annual !== null && annual > 0 && (
          <div className="node-detail__pricing-annual">
            ≈ ${annual.toFixed(0)} / year
          </div>
        )}
        {breakdown !== null && (
          <div className="node-detail__pricing-breakdown">
            <span className="node-detail__pricing-breakdown-label">How:</span>
            {breakdown}
          </div>
        )}
        {monthly === null && (
          <div className="node-detail__pricing-unknown">No pricing data for this resource type</div>
        )}
      </div>
      <div className="node-detail__sep" />

      <p className="node-detail__address">{node.address}</p>
      {node.moduleAddress !== null && (
        <p className="node-detail__module">module: {node.moduleAddress}</p>
      )}
      <AttributesPanel attributes={node.attributes} />
    </aside>
  );
});

// ── Recursive attribute value renderer ──────────────────────────────────────
function NestedValue({ val, depth = 0 }: { val: unknown; depth?: number }) {
  const autoOpen =
    depth === 0 &&
    typeof val === "object" &&
    val !== null &&
    Object.keys(val).length <= 4;
  const [open, setOpen] = useState(autoOpen);

  if (val === null || val === undefined)
    return <span className="attr-val--null">null</span>;
  if (typeof val === "boolean")
    return <span className="attr-val--bool">{String(val)}</span>;
  if (typeof val === "number")
    return <span className="attr-val--number">{val}</span>;
  if (typeof val === "string") {
    if (val === "") return <span className="attr-val--empty">(empty)</span>;
    return (
      <span className="attr-val--string" title={val.length > 80 ? val : undefined}>
        {val.length > 72 ? val.slice(0, 70) + "…" : val}
      </span>
    );
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return <span className="attr-val--empty">[ ]</span>;
    return (
      <span className="attr-nested">
        <button className="attr-nested__toggle" onClick={() => setOpen((o) => !o)}>
          {open ? "▾" : "▸"} [{val.length} item{val.length !== 1 ? "s" : ""}]
        </button>
        {open && (
          <dl className="attr-nested__list">
            {val.map((item, i) => (
              <div key={i} className="attr-nested__row">
                <dt className="attr-nested__key attr-nested__key--index">[{i}]</dt>
                <dd className="attr-nested__dd">
                  <NestedValue val={item} depth={depth + 1} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </span>
    );
  }
  if (typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return <span className="attr-val--empty">{"{ }"}</span>;
    return (
      <span className="attr-nested">
        <button className="attr-nested__toggle" onClick={() => setOpen((o) => !o)}>
          {open ? "▾" : "▸"} {"{"}
          {entries.length} key{entries.length !== 1 ? "s" : ""}
          {"}"}
        </button>
        {open && (
          <dl className="attr-nested__list">
            {entries.map(([k, v]) => (
              <div key={k} className="attr-nested__row">
                <dt className="attr-nested__key">{k}</dt>
                <dd className="attr-nested__dd">
                  <NestedValue val={v} depth={depth + 1} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </span>
    );
  }
  return <span>{String(val)}</span>;
}

// ── Searchable attributes panel ───────────────────────────────────────────
function AttributesPanel({ attributes }: { attributes: Readonly<Record<string, unknown>> }) {
  const [query, setQuery] = useState("");

  const entries = useMemo(() => {
    const all = Object.entries(attributes);
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter(
      ([k, v]) =>
        k.toLowerCase().includes(q) ||
        JSON.stringify(v ?? null).toLowerCase().includes(q),
    );
  }, [attributes, query]);

  const total = Object.keys(attributes).length;

  return (
    <div className="attr-panel">
      <div className="attr-panel__header">
        <span className="attr-panel__title">Attributes</span>
        <span className="attr-panel__count">
          {entries.length === total ? total : `${entries.length} / ${total}`}
        </span>
      </div>
      <div className="attr-panel__search-wrap">
        <svg className="attr-panel__search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="6.5" cy="6.5" r="4.5" />
          <path d="M10 10l3.5 3.5" strokeLinecap="round" />
        </svg>
        <input
          className="attr-panel__search"
          type="text"
          placeholder="Filter attributes…"
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery((e.target as HTMLInputElement).value)}
          spellCheck={false}
        />
        {query && (
          <button className="attr-panel__clear" onClick={() => setQuery("")} aria-label="Clear filter">
            ✕
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="attr-panel__empty">No attributes match &ldquo;{query}&rdquo;</p>
      ) : (
        <dl className="attr-panel__list">
          {entries.map(([key, val]) => (
            <div key={key} className="attr-panel__row">
              <dt className="attr-panel__key" title={key}>
                {key}
              </dt>
              <dd className="attr-panel__val">
                <NestedValue val={val} depth={0} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// ── Compare view ─────────────────────────────────────────────────────────
const ACTION_CONFIG: Record<
  ChangeAction,
  { label: string; className: string; symbol: string }
> = {
  [ChangeAction.CREATE]: { label: "Create", className: "cmp-badge--create", symbol: "+" },
  [ChangeAction.UPDATE]: { label: "Update", className: "cmp-badge--update", symbol: "~" },
  [ChangeAction.DELETE]: { label: "Delete", className: "cmp-badge--delete", symbol: "−" },
  [ChangeAction.REPLACE]: { label: "Replace", className: "cmp-badge--replace", symbol: "±" },
  [ChangeAction.NO_OP]: { label: "No-op", className: "cmp-badge--noop", symbol: "=" },
};

const COMPARE_ORDER: ChangeAction[] = [
  ChangeAction.DELETE,
  ChangeAction.REPLACE,
  ChangeAction.CREATE,
  ChangeAction.UPDATE,
  ChangeAction.NO_OP,
];

const CompareView = memo(function CompareView({
  model,
  onNodeSelect,
}: {
  model: GraphModel;
  onNodeSelect: (node: GraphNode) => void;
}) {
  const [filter, setFilter] = useState<ChangeAction | "all">("all");

  const counts = useMemo(
    () =>
      Object.fromEntries(
        COMPARE_ORDER.map((a) => [a, model.nodes.filter((n) => n.changeAction === a).length]),
      ) as Record<ChangeAction, number>,
    [model],
  );

  const visible = useMemo(() => {
    if (filter === "all")
      return model.nodes.filter((n) => n.changeAction !== ChangeAction.NO_OP);
    return model.nodes.filter((n) => n.changeAction === filter);
  }, [model, filter]);

  const totalChanges = model.nodes.filter((n) => n.changeAction !== ChangeAction.NO_OP).length;

  return (
    <div className="compare-view">
      {/* Summary pills */}
      <div className="compare-view__summary">
        {COMPARE_ORDER.map((action) => {
          const { label, className, symbol } = ACTION_CONFIG[action];
          const count = counts[action];
          return (
            <button
              key={action}
              className={`cmp-badge ${className}${
                filter === action ? " cmp-badge--active" : ""
              }${count === 0 ? " cmp-badge--zero" : ""}`}
              onClick={() => setFilter((f) => (f === action ? "all" : action))}
              title={`Filter to ${label.toLowerCase()} resources`}
            >
              <span className="cmp-badge__symbol">{symbol}</span>
              <span className="cmp-badge__label">{label}</span>
              <span className="cmp-badge__count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="compare-view__list-header">
        {filter === "all" ? (
          <span>{totalChanges} change{totalChanges !== 1 ? "s" : ""}</span>
        ) : (
          <span>
            {visible.length} {ACTION_CONFIG[filter as ChangeAction].label.toLowerCase()}
            {visible.length !== 1 ? "s" : ""}
          </span>
        )}
        {filter !== "all" && (
          <button className="compare-view__clear" onClick={() => setFilter("all")}>
            Show all
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="compare-view__empty">
          {filter === "all" ? "No planned changes." : `No ${ACTION_CONFIG[filter as ChangeAction].label.toLowerCase()} actions.`}
        </div>
      ) : (
        <ul className="compare-view__list">
          {visible.map((node) => {
            const { className, symbol } = ACTION_CONFIG[node.changeAction];
            const { monthly } = estimateCost(node);
            return (
              <li
                key={node.id}
                className="compare-view__row"
                onClick={() => onNodeSelect(node)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onNodeSelect(node)}
              >
                <span className={`cmp-badge ${className} cmp-badge--icon`}>{symbol}</span>
                <span className="compare-view__row-name">{node.name}</span>
                <span className="compare-view__row-type">{node.type}</span>
                {monthly !== null && monthly > 0 && (
                  <span
                    className="compare-view__row-cost"
                    style={{
                      color:
                        node.changeAction === ChangeAction.CREATE
                          ? "#22c55e"
                          : node.changeAction === ChangeAction.DELETE
                            ? "#ef4444"
                            : undefined,
                    }}
                  >
                    {node.changeAction === ChangeAction.CREATE
                      ? "+"
                      : node.changeAction === ChangeAction.DELETE
                        ? "−"
                        : ""}
                    ${monthly.toFixed(0)}/mo
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

// ── Plan vs Baseline diff view ─────────────────────────────────────────────
const DiffView = memo(function DiffView({
  diff,
  baselineName,
  onNodeSelect,
}: {
  diff: PlanDiff;
  baselineName: string;
  onNodeSelect: (node: GraphNode) => void;
}) {
  const [filter, setFilter] = useState<DiffKind | "all">("all");

  const visible = useMemo(() => {
    if (filter === "all") return diff.entries;
    return diff.entries.filter((e) => e.kind === filter);
  }, [diff, filter]);

  const deltaSign = diff.totalCostDelta > 0 ? "+" : "";
  const deltaColor =
    diff.totalCostDelta > 0.5
      ? "#ef4444"
      : diff.totalCostDelta < -0.5
        ? "#22c55e"
        : "#64748b";

  return (
    <div className="diff-view">
      {/* Banner */}
      <div className="diff-view__banner">
        <div className="diff-view__banner-title">
          vs. <strong>{baselineName}</strong>
        </div>
        <div className="diff-view__banner-delta" style={{ color: deltaColor }}>
          {deltaSign}${Math.abs(diff.totalCostDelta).toFixed(0)}
          <span className="diff-view__banner-delta-unit">/mo</span>
          <span className="diff-view__banner-delta-label">
            {diff.totalCostDelta > 0.5
              ? "cost increase"
              : diff.totalCostDelta < -0.5
                ? "cost saving"
                : "no cost change"}
          </span>
        </div>
        <div className="diff-view__banner-stats">
          <span className="diff-view__stat diff-view__stat--added">+{diff.addedCount} added</span>
          <span className="diff-view__stat diff-view__stat--removed">−{diff.removedCount} removed</span>
          <span className="diff-view__stat diff-view__stat--unchanged">{diff.unchangedCount} unchanged</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="diff-view__tabs">
        {(["all", "added", "removed", "unchanged"] as const).map((f) => {
          const count =
            f === "all"
              ? diff.entries.length
              : f === "added"
                ? diff.addedCount
                : f === "removed"
                  ? diff.removedCount
                  : diff.unchangedCount;
          return (
            <button
              key={f}
              className={`diff-view__tab${filter === f ? " diff-view__tab--active" : ""}${count === 0 ? " diff-view__tab--zero" : ""}`}
              onClick={() => setFilter(f)}
              disabled={count === 0}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="diff-view__tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Resource list */}
      <ul className="diff-view__list">
        {visible.map((entry) => {
          const { node } = entry;
          const badgeClass =
            entry.kind === "added"
              ? "diff-badge--added"
              : entry.kind === "removed"
                ? "diff-badge--removed"
                : "diff-badge--unchanged";
          const symbol =
            entry.kind === "added" ? "+" : entry.kind === "removed" ? "−" : "=";
          const isClickable = entry.kind !== "removed";
          return (
            <li
              key={`${entry.kind}-${node.id}`}
              className={`diff-view__row${isClickable ? " diff-view__row--clickable" : ""}`}
              onClick={() => isClickable && onNodeSelect(node)}
              role={isClickable ? "button" : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onKeyDown={(e) => e.key === "Enter" && isClickable && onNodeSelect(node)}
            >
              <span className={`diff-badge ${badgeClass}`}>{symbol}</span>
              <span className="diff-view__row-name">{node.name}</span>
              <span className="diff-view__row-type">
                {node.type.replace(/^(aws_|azurerm_|google_)/, "")}
              </span>
              {entry.costDelta !== null && Math.abs(entry.costDelta) >= 0.5 && (
                <span
                  className="diff-view__row-delta"
                  style={{ color: entry.costDelta > 0 ? "#ef4444" : "#22c55e" }}
                >
                  {entry.costDelta > 0 ? "+" : ""}${entry.costDelta.toFixed(0)}/mo
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
});

// ── Cost breakdown panel ────────────────────────────────────────────────────
const PROVIDER_LOGO_PATH_COST: Partial<Record<CloudProvider, string>> = {
  [CloudProvider.AWS]:   "/providers/aws.svg",
  [CloudProvider.GCP]:   "/providers/gcp.svg",
  [CloudProvider.AZURE]: "/providers/azure.svg",
};

const PROVIDER_DISPLAY: Record<string, { label: string; color: string }> = {
  AWS:     { label: "Amazon Web Services", color: "#f59e0b" },
  GCP:     { label: "Google Cloud",        color: "#22c55e" },
  AZURE:   { label: "Microsoft Azure",     color: "#0ea5e9" },
  UNKNOWN: { label: "Unknown",             color: "#6b7280" },
};

const CostBreakdown = memo(function CostBreakdown({ model }: { model: GraphModel }) {
  const { monthly, byProvider, rows, free, unknown } = useMemo(() => {
    // Single pass over nodes — compute everything together
    const costs = model.nodes.map((n) => ({ node: n, monthly: estimateCost(n).monthly }));
    const monthly = costs.reduce((s, r) => s + (r.monthly ?? 0), 0);
    const byProvider = costByProvider(model.nodes);
    const rows = costs
      .filter((r) => r.monthly !== null && r.monthly > 0)
      .sort((a, b) => (b.monthly ?? 0) - (a.monthly ?? 0));
    const free = costs.filter((r) => r.monthly === 0).length;
    const unknown = costs.filter((r) => r.monthly === null).length;
    return { monthly, byProvider, rows, free, unknown };
  }, [model]);

  return (
    <aside className="cost-breakdown">
      <div className="cost-breakdown__header">
        <span className="cost-breakdown__total">
          {monthly === 0 ? "$0" : `~$${monthly.toFixed(0)}`}
          <span className="cost-breakdown__total-unit">/mo</span>
        </span>
        <span className="cost-breakdown__total-annual">
          ≈ ${(monthly * 12).toFixed(0)}/yr
        </span>
      </div>

      {byProvider.length > 1 && (
        <>
          <div className="cost-breakdown__section-title">By Provider</div>
          <div className="cost-breakdown__providers">
            {byProvider.map(({ provider, monthly: pm }) => {
              const cfg = PROVIDER_DISPLAY[provider] ?? PROVIDER_DISPLAY["UNKNOWN"];
              if (!cfg) return null;
              const pct = monthly > 0 ? Math.round((pm / monthly) * 100) : 0;
              return (
                <div key={provider} className="cost-breakdown__provider-row">
                  <span className="cost-breakdown__provider-dot" style={{ background: cfg.color }} />
                  {PROVIDER_LOGO_PATH_COST[provider as CloudProvider] ? (
                    <img src={PROVIDER_LOGO_PATH_COST[provider as CloudProvider]} alt={provider} className="cost-breakdown__provider-logo" />
                  ) : null}
                  <span className="cost-breakdown__provider-name">{provider}</span>
                  <div className="cost-breakdown__provider-bar-wrap">
                    <div className="cost-breakdown__provider-bar" style={{ width: `${pct}%`, background: cfg.color }} />
                  </div>
                  <span className="cost-breakdown__provider-amount">${pm.toFixed(0)}</span>
                  <span className="cost-breakdown__provider-pct">{pct}%</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="cost-breakdown__section-title">By Resource</div>
      {rows.length === 0 ? (
        <p className="cost-breakdown__empty">No resources with known costs.</p>
      ) : (
        <ul className="cost-breakdown__list">
          {rows.map(({ node, monthly: rm }) => (
            <li key={node.id} className="cost-breakdown__row">
              <span className="cost-breakdown__row-name">{node.name}</span>
              <span className="cost-breakdown__row-type">{node.type.replace(/^(aws_|azurerm_|google_)/, "")}</span>
              <span className="cost-breakdown__row-amount">${(rm ?? 0).toFixed(0)}<span className="cost-breakdown__row-unit">/mo</span></span>
            </li>
          ))}
        </ul>
      )}

      <div className="cost-breakdown__footer">
        {free > 0 && <span>{free} free resource{free !== 1 ? "s" : ""}</span>}
        {unknown > 0 && <span>{unknown} without pricing data</span>}
        <span className="cost-breakdown__disclaimer">Rough estimates only — actual costs vary.</span>
      </div>
    </aside>
  );
});

// ── Graph filter bar ──────────────────────────────────────────────────────
const ACTION_CHIP_COLORS: Record<ChangeAction, string> = {
  [ChangeAction.CREATE]:  "#22c55e",
  [ChangeAction.UPDATE]:  "#f59e0b",
  [ChangeAction.DELETE]:  "#ef4444",
  [ChangeAction.REPLACE]: "#f97316",
  [ChangeAction.NO_OP]:   "#64748b",
};

const LAYER_CHIP_COLORS: Record<ResourceLayer, string> = {
  [ResourceLayer.NETWORK]:  "#6366f1",
  [ResourceLayer.COMPUTE]:  "#0ea5e9",
  [ResourceLayer.DATABASE]: "#a855f7",
  [ResourceLayer.STORAGE]:  "#f59e0b",
  [ResourceLayer.DATA]:     "#14b8a6",
  [ResourceLayer.UNKNOWN]:  "#6b7280",
};

const PROVIDER_CHIP_COLORS: Record<CloudProvider, string> = {
  [CloudProvider.AWS]:     "#f59e0b",
  [CloudProvider.AZURE]:   "#0ea5e9",
  [CloudProvider.GCP]:     "#22c55e",
  [CloudProvider.UNKNOWN]: "#6b7280",
};

const PROVIDER_LABELS: Record<CloudProvider, string> = {
  [CloudProvider.AWS]:     "AWS",
  [CloudProvider.AZURE]:   "Azure",
  [CloudProvider.GCP]:     "GCP",
  [CloudProvider.UNKNOWN]: "Unknown",
};

const PROVIDER_LOGO_PATH: Partial<Record<CloudProvider, string>> = {
  [CloudProvider.AWS]:   "/providers/aws.svg",
  [CloudProvider.GCP]:   "/providers/gcp.svg",
  [CloudProvider.AZURE]: "/providers/azure.svg",
};

function getNodeTags(node: GraphNode): string[] {
  const raw = node.attributes.tags;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([k]) => k !== "Name")
    .map(([k, v]) => `${k}:${String(v)}`);
}

interface GraphFilter {
  actions: Set<ChangeAction>;
  layers: Set<ResourceLayer>;
  providers: Set<CloudProvider>;
  search: string;
  tags: Set<string>;
}

const GraphFilterBar = memo(function GraphFilterBar({
  filter,
  model,
  filteredCount,
  onChange,
}: {
  filter: GraphFilter;
  model: GraphModel;
  filteredCount: number;
  onChange: (f: GraphFilter) => void;
}) {
  const hasActiveFilter =
    filter.actions.size > 0 || filter.layers.size > 0 || filter.providers.size > 0 || filter.tags.size > 0 || filter.search !== "";

  function toggleAction(action: ChangeAction) {
    const next = new Set(filter.actions);
    if (next.has(action)) next.delete(action);
    else next.add(action);
    onChange({ ...filter, actions: next });
  }

  function toggleLayer(layer: ResourceLayer) {
    const next = new Set(filter.layers);
    if (next.has(layer)) next.delete(layer);
    else next.add(layer);
    onChange({ ...filter, layers: next });
  }

  function toggleProvider(provider: CloudProvider) {
    const next = new Set(filter.providers);
    if (next.has(provider)) next.delete(provider);
    else next.add(provider);
    onChange({ ...filter, providers: next });
  }

  function clearAll() {
    onChange({ actions: new Set(), layers: new Set(), providers: new Set(), search: "", tags: new Set() });
  }

  // Count resources per action / layer for display in chips
  const actionCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.values(ChangeAction).map((a) => [a, model.nodes.filter((n) => n.changeAction === a).length]),
      ) as Record<ChangeAction, number>,
    [model],
  );

  const layerCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.values(ResourceLayer).map((l) => [l, model.nodes.filter((n) => n.layer === l).length]),
      ) as Record<ResourceLayer, number>,
    [model],
  );

  const providerCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.values(CloudProvider).map((p) => [p, model.nodes.filter((n) => n.provider === p).length]),
      ) as Record<CloudProvider, number>,
    [model],
  );

  // Only show provider chips for providers actually present in this plan
  const activeProviders = useMemo(
    () => Object.values(CloudProvider).filter((p) => p !== CloudProvider.UNKNOWN && providerCounts[p] > 0),
    [providerCounts],
  );

  const totalCount = model.nodes.length;

  function toggleTag(tag: string) {
    const next = new Set(filter.tags);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange({ ...filter, tags: next });
  }

  const allTags = useMemo(
    () => [...new Set(model.nodes.flatMap(getNodeTags))].sort(),
    [model],
  );

  const [tagOpen, setTagOpen] = useState(false);
  const tagWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tagOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (tagWrapRef.current && !tagWrapRef.current.contains(e.target as Node)) {
        setTagOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [tagOpen]);

  return (
    <div className="graph-filter-bar">
      <div className="graph-filter-bar__groups">
        {/* Action chips */}
        <div className="graph-filter-bar__group">
          {Object.values(ChangeAction).map((action) => {
            const active = filter.actions.has(action);
            const color = ACTION_CHIP_COLORS[action];
            const count = actionCounts[action];
            if (count === 0) return null;
            return (
              <button
                key={action}
                className={`graph-filter-chip${active ? " graph-filter-chip--active" : ""}`}
                style={active ? { background: color, borderColor: color, color: "#fff" } : { borderColor: color, color: color }}
                onClick={() => toggleAction(action)}
                title={`Filter by ${action.toLowerCase()}`}
              >
                {action === ChangeAction.CREATE ? "+" :
                 action === ChangeAction.UPDATE ? "~" :
                 action === ChangeAction.DELETE ? "−" :
                 action === ChangeAction.REPLACE ? "±" : "="}
                {" "}{action.replace("_", "-")} {count}
              </button>
            );
          })}
        </div>

        {/* Separator */}
        <div className="graph-filter-bar__sep" />

        {/* Provider chips — only shown when >1 provider exists in the plan */}
        {activeProviders.length > 1 && (
          <>
            <div className="graph-filter-bar__group">
              {activeProviders.map((provider) => {
                const active = filter.providers.has(provider);
                const color = PROVIDER_CHIP_COLORS[provider];
                const count = providerCounts[provider];
                return (
                  <button
                    key={provider}
                    className={`graph-filter-chip graph-filter-chip--provider${active ? " graph-filter-chip--active" : ""}`}
                    style={active ? { background: color, borderColor: color, color: "#fff" } : { borderColor: color, color: color }}
                    onClick={() => toggleProvider(provider)}
                    title={`Filter by ${PROVIDER_LABELS[provider]}`}
                  >
                    {PROVIDER_LOGO_PATH[provider] ? (
                      <img
                        src={PROVIDER_LOGO_PATH[provider]}
                        alt={PROVIDER_LABELS[provider]}
                        className="graph-filter-chip__provider-logo"
                        aria-hidden="true"
                      />
                    ) : null}
                    {PROVIDER_LABELS[provider]} {count}
                  </button>
                );
              })}
            </div>
            <div className="graph-filter-bar__sep" />
          </>
        )}

        {/* Layer chips */}
        <div className="graph-filter-bar__group">
          {Object.values(ResourceLayer)
            .filter((l) => l !== ResourceLayer.UNKNOWN)
            .map((layer) => {
              const active = filter.layers.has(layer);
              const color = LAYER_CHIP_COLORS[layer];
              const count = layerCounts[layer];
              if (count === 0) return null;
              return (
                <button
                  key={layer}
                  className={`graph-filter-chip${active ? " graph-filter-chip--active" : ""}`}
                  style={active ? { background: color, borderColor: color, color: "#fff" } : { borderColor: color, color: color }}
                  onClick={() => toggleLayer(layer)}
                  title={`Filter by ${layer.toLowerCase()} layer`}
                >
                  {layer.toLowerCase()} {count}
                </button>
              );
            })}
        </div>
        {/* Tag dropdown — only when tags exist in the plan */}
        {allTags.length > 0 && (
          <>
            <div className="graph-filter-bar__sep" />
            <div ref={tagWrapRef} className="graph-filter-bar__tag-wrap">
              <button
                className={`graph-filter-chip graph-filter-chip--tags${filter.tags.size > 0 ? " graph-filter-chip--active" : ""}`}
                style={
                  filter.tags.size > 0
                    ? { background: "#8b5cf6", borderColor: "#8b5cf6", color: "#fff" }
                    : { borderColor: "#8b5cf6", color: "#8b5cf6" }
                }
                onClick={() => setTagOpen((o) => !o)}
                title="Filter by resource tags"
              >
                Tags{filter.tags.size > 0 ? ` · ${filter.tags.size}` : ""}
                <span className="graph-filter-chip__caret">{tagOpen ? "▴" : "▾"}</span>
              </button>

              {tagOpen && (
                <div className="graph-filter-bar__tag-dropdown">
                  <div className="graph-filter-bar__tag-dropdown-title">Filter by tag</div>
                  <div className="graph-filter-bar__tag-chips">
                    {allTags.map((tag) => {
                      const colonIdx = tag.indexOf(":");
                      const key = tag.slice(0, colonIdx);
                      const val = tag.slice(colonIdx + 1);
                      const active = filter.tags.has(tag);
                      return (
                        <button
                          key={tag}
                          className={`graph-filter-chip graph-filter-chip--tag-item${active ? " graph-filter-chip--active" : ""}`}
                          style={
                            active
                              ? { background: "#8b5cf6", borderColor: "#8b5cf6", color: "#fff" }
                              : {}
                          }
                          onClick={() => toggleTag(tag)}
                        >
                          <span className="graph-filter-chip__tag-key">{key}</span>
                          <span className="graph-filter-chip__tag-sep">:</span>
                          <span className="graph-filter-chip__tag-val">{val}</span>
                        </button>
                      );
                    })}
                  </div>
                  {filter.tags.size > 0 && (
                    <button
                      className="graph-filter-bar__tag-clear"
                      onClick={() => onChange({ ...filter, tags: new Set() })}
                    >
                      Clear tag filters
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}      </div>

      {/* Search + count + clear */}
      <div className="graph-filter-bar__right">
        <div className="graph-filter-bar__search-wrap">
          <svg className="graph-filter-bar__search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10 10l3.5 3.5" strokeLinecap="round" />
          </svg>
          <input
            className="graph-filter-bar__search"
            type="text"
            placeholder="Search resources…"
            value={filter.search}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...filter, search: e.target.value })}
            spellCheck={false}
          />
          {filter.search && (
            <button
              className="graph-filter-bar__search-clear"
              onClick={() => onChange({ ...filter, search: "" })}
              aria-label="Clear search"
            >✕</button>
          )}
        </div>
        <span className={`graph-filter-bar__count${hasActiveFilter ? " graph-filter-bar__count--active" : ""}`}>
          {hasActiveFilter ? `${filteredCount} / ${totalCount}` : `${totalCount}`} resources
        </span>
        {hasActiveFilter && (
          <button className="graph-filter-bar__clear-all" onClick={clearAll} title="Clear all filters">
            Clear
          </button>
        )}
      </div>
    </div>
  );
});

export default function GraphPage() {
  const [model, setModel] = useState<GraphModel | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [detailW, setDetailW] = useState(DEFAULT_DETAIL);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("cost");
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyWrapRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportWrapRef = useRef<HTMLDivElement>(null);

  const [baseline, setBaseline] = useState<BaselineEntry | null>(null);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  const [, startBaselineTransition] = useTransition();

  // Only compute the expensive diff when the diff view is actually visible.
  // gating on viewMode prevents diffPlans() from running during chat streaming.
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

  const loadFromHistory = useCallback((entry: PlanHistoryEntry) => {
    savePlan(entry.model);
    setModel(entry.model);
    setFilter({ actions: new Set(), layers: new Set(), providers: new Set(), search: "", tags: new Set() });
    setHistoryOpen(false);
  }, []);

  const handlePinBaseline = useCallback((entry: PlanHistoryEntry) => {
    // Close dropdown immediately (high-priority)
    setHistoryOpen(false);
    // Defer the localStorage write so it doesn't block the current frame
    setTimeout(() => saveBaseline(entry.name, entry.model), 0);
    // Mark baseline state update as a low-priority transition so chat streaming isn't interrupted
    startBaselineTransition(() => {
      setBaseline({ name: entry.name, savedAt: new Date().toISOString(), nodeCount: entry.model.nodes.length, model: entry.model });
    });
  }, [startBaselineTransition]);

  const handleUnpinBaseline = useCallback(() => {
    clearBaseline();
    startBaselineTransition(() => {
      setBaseline(null);
      setViewMode((m) => (m === "diff" ? "2d" : m));
    });
  }, [startBaselineTransition]);

  const exportShareURL = useCallback(async () => {
    if (!model) return;
    try {
      const encoded = await encodePlan(model);
      const url = `${window.location.origin}${window.location.pathname}?${PLAN_URL_PARAM}=${encoded}`;
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
    if (!model) return;
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `terraform-plan.json`; a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [model]);

  const exportCSV = useCallback(() => {
    if (!model) return;
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

  const loadExample = useCallback((plan: GraphModel) => {
    savePlan(plan);
    setModel(plan);
    setFilter({ actions: new Set(), layers: new Set(), providers: new Set(), search: "", tags: new Set() });
  }, []);

  const handleNodeSelect = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    setActiveTab("detail");
  }, []);

  if (model === null) {
    return (
      <div className="graph-empty">
        <div className="graph-empty__icon">
          <svg
            width="56"
            height="56"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
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

          {/* AI Chat — opens full chat page */}
          <button
            className={`btn ${chatOpen ? "btn--primary" : "btn--secondary"} graph-page__ai-btn`}
            onClick={() => { setChatOpen((o) => !o); if (!chatOpen) setActiveTab("chat"); }}
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
                          onClick={() => loadFromHistory(entry)}
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
                          onClick={() => isPinned ? handleUnpinBaseline() : handlePinBaseline(entry)}
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
            <TwoDGraph model={filteredModel ?? model} onNodeSelect={handleNodeSelect} />
          ) : (
            <CompareView model={filteredModel ?? model} onNodeSelect={handleNodeSelect} />
          )}
        </div>

        {/* Right panel: shown when a node is selected, cost tab active, or chat open */}
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
                <CostBreakdown model={filteredModel ?? model} />
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
