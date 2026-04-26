"use client";

import { useState, useMemo, memo, type ChangeEvent } from "react";
import type { GraphNode } from "@terraform-viz/graph-schema";
import { ChangeAction, ResourceLayer, CloudProvider } from "@terraform-viz/graph-schema";
import { estimateCost } from "@/lib/pricing-estimates";
import { isUsageBased } from "@/lib/usage-params";
import { applyUsageOverrides } from "@/lib/usage-store";
import { useUsageStore } from "@/stores/useUsageStore";
import { UsageEditor } from "@/components/graph/UsageEditor";

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

// ── Recursive attribute value renderer ──────────────────────────────────────
export function NestedValue({ val, depth = 0 }: { val: unknown; depth?: number }) {
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
export function AttributesPanel({ attributes }: { attributes: Readonly<Record<string, unknown>> }) {
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
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.currentTarget.value)}
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

// ── Node detail panel ──────────────────────────────────────────────────────
export const NodeDetail = memo(function NodeDetail({
  node,
  onUsageUpdate,
}: {
  node: GraphNode;
  onUsageUpdate?: () => void;
}) {
  const nodeOverrides = useUsageStore((s) => s.overrides[node.id]);
  const effectiveNode = nodeOverrides
    ? { ...node, attributes: applyUsageOverrides(node.attributes as Record<string, unknown>, nodeOverrides) }
    : node;
  const { monthly, annual, breakdown } = estimateCost(effectiveNode);

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
      {isUsageBased(node.type) && (
        <UsageEditor
          nodeId={node.id}
          resourceType={node.type}
          attributes={node.attributes as Record<string, unknown>}
          onUpdate={onUsageUpdate ?? (() => {})}
        />
      )}
      <AttributesPanel attributes={node.attributes} />
    </aside>
  );
});
