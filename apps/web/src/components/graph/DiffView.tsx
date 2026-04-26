"use client";

import { useState, useMemo, memo } from "react";
import type { GraphNode } from "@terraform-viz/graph-schema";
import type { PlanDiff, DiffKind } from "@/lib/plan-diff";

export const DiffView = memo(function DiffView({
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
