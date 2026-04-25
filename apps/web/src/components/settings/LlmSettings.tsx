"use client";

import { useState, useEffect, useCallback } from "react";

const SETTINGS_KEY = "terraform-viz:llm-settings";

interface LlmSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const DEFAULT_SETTINGS: LlmSettings = {
  baseUrl: "",
  apiKey: "",
  model: "gpt-4o-mini",
};

const PRESETS: { label: string; baseUrl: string; model: string }[] = [
  { label: "OpenAI", baseUrl: "", model: "gpt-4o-mini" },
  { label: "Ollama", baseUrl: "http://localhost:11434/v1", model: "llama3.2" },
  { label: "LM Studio", baseUrl: "http://localhost:1234/v1", model: "local-model" },
  {
    label: "Azure OpenAI",
    baseUrl: "https://<resource>.openai.azure.com/openai/deployments/<deploy>",
    model: "gpt-4o",
  },
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.1-70b-versatile" },
];

function loadSettings(): LlmSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<LlmSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function LlmSettings() {
  const [settings, setSettings] = useState<LlmSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const handleChange = useCallback((field: keyof LlmSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }, []);

  const applyPreset = useCallback(
    (preset: { label: string; baseUrl: string; model: string }) => {
      setSettings((prev) => ({ ...prev, baseUrl: preset.baseUrl, model: preset.model }));
      setSaved(false);
    },
    [],
  );

  const handleSave = useCallback(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setSaved(true);
  }, [settings]);

  return (
    <section className="settings-section card">
      <h2 className="settings-section__title">LLM / AI Provider</h2>
      <p className="settings-section__subtitle">
        Configure the OpenAI-compatible endpoint used for AI-powered plan analysis. These settings
        are stored locally in your browser.
      </p>

      <div className="settings-field">
        <label htmlFor="llm-base-url">Base URL</label>
        <p className="settings-field__hint">
          Leave blank to use the default OpenAI endpoint. Set to your provider&apos;s base URL for
          compatible APIs (Ollama, LM Studio, Azure OpenAI, Groq, etc.).
        </p>
        <input
          id="llm-base-url"
          type="url"
          className="settings-input"
          placeholder="https://api.openai.com/v1  (default)"
          value={settings.baseUrl}
          onChange={(e) => handleChange("baseUrl", e.target.value)}
        />
      </div>

      <div className="settings-field">
        <label htmlFor="llm-api-key">API Key</label>
        <p className="settings-field__hint">
          Your API key. For local providers (Ollama) any value works (e.g.{" "}
          <code
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              background: "#0a0c14",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            ollama
          </code>
          ).
        </p>
        <input
          id="llm-api-key"
          type="password"
          className="settings-input"
          placeholder="sk-…"
          value={settings.apiKey}
          onChange={(e) => handleChange("apiKey", e.target.value)}
        />
      </div>

      <div className="settings-field">
        <label htmlFor="llm-model">Model</label>
        <input
          id="llm-model"
          type="text"
          className="settings-input"
          placeholder="gpt-4o-mini"
          value={settings.model}
          onChange={(e) => handleChange("model", e.target.value)}
        />
      </div>

      <div className="settings-field">
        <label>Quick presets</label>
        <div className="settings-presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              className="settings-preset-btn"
              type="button"
              onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-save-row">
        <button className="btn btn--primary" type="button" onClick={handleSave}>
          Save settings
        </button>
        {saved && (
          <span className="settings-saved-msg">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Saved
          </span>
        )}
      </div>
    </section>
  );
}
