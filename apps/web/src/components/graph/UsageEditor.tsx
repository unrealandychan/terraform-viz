"use client";
import { getUsageParams, isUsageBased } from "@/lib/usage-params";
import { useUsageStore } from "@/stores/useUsageStore";

interface UsageEditorProps {
  nodeId: string;
  resourceType: string;
  attributes: Record<string, unknown>;
  onUpdate?: () => void; // optional — store handles reactivity
}

export function UsageEditor({ nodeId, resourceType, attributes, onUpdate }: UsageEditorProps) {
  const params = getUsageParams(resourceType);
  const overrides = useUsageStore((s) => s.overrides[nodeId])  ?? {};
  const setOverride = useUsageStore((s) => s.setOverride);
  const resetNode = useUsageStore((s) => s.resetNode);

  if (!isUsageBased(resourceType)) return null;

  function getValue(key: string, defaultValue: number): number {
    if (overrides[key] !== undefined) return overrides[key]!;
    const attrVal = attributes[key];
    if (attrVal !== undefined && !isNaN(Number(attrVal))) return Number(attrVal);
    return defaultValue;
  }

  function handleChange(key: string, value: number) {
    setOverride(nodeId, key, value);
    onUpdate?.();
  }

  function handleReset() {
    resetNode(nodeId);
    onUpdate?.();
  }

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="usage-editor">
      <div className="usage-editor__header">
        <span className="usage-editor__title">Usage Assumptions</span>
        <span className="usage-editor__hint-icon" title="Adjust monthly usage assumptions to refine cost estimates. These do not modify your Terraform plan.">ⓘ</span>
        {hasOverrides && (
          <button className="usage-editor__reset-btn" onClick={handleReset}>Reset</button>
        )}
      </div>
      <div className="usage-editor__params">
        {params.map((param) => {
          const val = getValue(param.key, param.defaultValue);
          const isOverridden = overrides[param.key] !== undefined;
          return (
            <div key={param.key} className="usage-editor__param">
              <div className="usage-editor__param-row">
                <label className={`usage-editor__label${isOverridden ? " usage-editor__label--overridden" : ""}`}>
                  {param.label}
                </label>
                <input
                  type="number"
                  className="usage-editor__input"
                  value={val}
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  onChange={(e) => handleChange(param.key, parseFloat(e.target.value) || 0)}
                />
                <span className="usage-editor__unit">{param.unit}</span>
              </div>
              <input
                type="range"
                className="usage-editor__slider"
                value={val}
                min={param.min}
                max={param.max}
                step={param.step}
                onChange={(e) => handleChange(param.key, parseFloat(e.target.value))}
              />
              {param.hint && <p className="usage-editor__param-hint">{param.hint}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
