"use client";

import { useState, useMemo, useEffect, useRef, memo, type ChangeEvent } from "react";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";
import { ChangeAction, ResourceLayer, CloudProvider } from "@terraform-viz/graph-schema";

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

export interface GraphFilter {
  actions: Set<ChangeAction>;
  layers: Set<ResourceLayer>;
  providers: Set<CloudProvider>;
  search: string;
  tags: Set<string>;
}

export function getNodeTags(node: GraphNode): string[] {
  const raw = node.attributes.tags;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([k]) => k !== "Name")
    .map(([k, v]) => `${k}:${String(v)}`);
}

export const GraphFilterBar = memo(function GraphFilterBar({
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
