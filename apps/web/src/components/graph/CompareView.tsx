"use client";

import { useState, useMemo, memo } from "react";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";
import { ChangeAction } from "@terraform-viz/graph-schema";
import { estimateCost } from "@/lib/pricing-estimates";

const ACTION_CONFIG: Record<ChangeAction, { label: string; className: string; symbol: string }> = {
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

export const CompareView = memo(function CompareView({
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
    if (filter === "all") return model.nodes.filter((n) => n.changeAction !== ChangeAction.NO_OP);
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
          <span>
            {totalChanges} change{totalChanges !== 1 ? "s" : ""}
          </span>
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
          {filter === "all"
            ? "No planned changes."
            : `No ${ACTION_CONFIG[filter as ChangeAction].label.toLowerCase()} actions.`}
        </div>
      ) : (
        <ul className="compare-view__list">
          {visible.map((node) => {
            const { className, symbol } =
              ACTION_CONFIG[node.changeAction ?? ChangeAction.NO_OP] ??
              ACTION_CONFIG[ChangeAction.NO_OP];
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
