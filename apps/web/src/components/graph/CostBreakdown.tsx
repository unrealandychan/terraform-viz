"use client";

import { useMemo, memo } from "react";
import type { GraphModel } from "@terraform-viz/graph-schema";
import { CloudProvider } from "@terraform-viz/graph-schema";
import { estimateCost, costByProvider } from "@/lib/pricing-estimates";
import { applyUsageOverrides } from "@/lib/usage-store";
import { useUsageStore } from "@/stores/useUsageStore";

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

export const CostBreakdown = memo(function CostBreakdown({
  model,
  onResetAll,
}: {
  model: GraphModel;
  onResetAll?: () => void;
}) {
  const overrides = useUsageStore((s) => s.overrides);
  const resetAll = useUsageStore((s) => s.resetAll);

  const { monthly, byProvider, rows, free, unknown } = useMemo(() => {
    // Single pass over nodes — compute everything together
    const costs = model.nodes.map((n) => {
      const nodeOverrides = overrides[n.id];
      const effectiveNode = nodeOverrides
        ? { ...n, attributes: applyUsageOverrides(n.attributes as Record<string, unknown>, nodeOverrides) }
        : n;
      return { node: n, monthly: estimateCost(effectiveNode).monthly };
    });
    const monthly = costs.reduce((s, r) => s + (r.monthly ?? 0), 0);
    const byProvider = costByProvider(model.nodes);
    const rows = costs
      .filter((r) => r.monthly !== null && r.monthly > 0)
      .sort((a, b) => (b.monthly ?? 0) - (a.monthly ?? 0));
    const free = costs.filter((r) => r.monthly === 0).length;
    const unknown = costs.filter((r) => r.monthly === null).length;
    return { monthly, byProvider, rows, free, unknown };
  }, [model, overrides]);

  const count = Object.values(overrides).filter((o) => Object.keys(o).length > 0).length;

  return (
    <aside className="cost-breakdown">
      {count > 0 && (
        <div className="cost-customized-badge">
          <span className="cost-customized-badge__text">
            ✦ {count} resource{count > 1 ? "s" : ""} with custom usage
          </span>
          <button
            className="cost-customized-badge__reset"
            onClick={() => { resetAll(); onResetAll?.(); }}
          >
            Reset all
          </button>
        </div>
      )}
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
