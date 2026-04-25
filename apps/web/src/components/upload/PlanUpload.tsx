"use client";

import { useState, useCallback, useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { GraphModel } from "@terraform-viz/graph-schema";
import { PLAN_STORAGE_KEY, saveToHistory } from "@/lib/plan-store";

const ACCEPTED_FILE_TYPES = ".json,.zip";

// Step labels shown while the worker runs (zip upload path only)
const WORKER_STEPS = [
  "Uploading archive…",
  "Running terraform init…",
  "Generating plan…",
  "Parsing graph…",
] as const;

export function PlanUpload() {
  const router = useRouter();
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Parsing & visualizing…");
  const [varsText, setVarsText] = useState("");
  const [varsOpen, setVarsOpen] = useState(false);
  const pendingFileNameRef = useRef<string>("plan.json");
  // Track the step ticker for worker upload so we can clear it in finally
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStepTicker = useCallback(() => {
    if (stepTimerRef.current !== null) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  /** Start cycling through worker step labels every ~10 s */
  const startStepTicker = useCallback(() => {
    let step = 0;
    setLoadingLabel(WORKER_STEPS[0] ?? "");
    stepTimerRef.current = setInterval(() => {
      step = Math.min(step + 1, WORKER_STEPS.length - 1);
      setLoadingLabel(WORKER_STEPS[step] ?? "");
    }, 10_000);
  }, []);

  const parseAndRedirect = useCallback(
    async (text: string, fileName: string) => {
      setError(null);
      setLoading(true);
      setLoadingLabel("Parsing & visualizing…");

      try {
        const parsed: unknown = JSON.parse(text);
        const response = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });

        const data: unknown = await response.json();

        if (!response.ok) {
          const errorData = data as Record<string, unknown>;
          setError(typeof errorData["error"] === "string" ? errorData["error"] : "Parse failed");
          return;
        }

        const model = data as GraphModel;
        localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(model));
        saveToHistory(model, fileName);
        router.push("/graph");
      } catch (parseError) {
        const message =
          parseError instanceof Error ? parseError.message : "Invalid JSON or network error";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  const runAndRedirect = useCallback(
    async (archiveBase64: string, fileName: string) => {
      setError(null);
      setLoading(true);
      startStepTicker();

      // Parse optional -var flags from the textarea (one per line, key=value)
      const vars = varsText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && l.includes("="));

      try {
        const response = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archiveBase64, vars }),
        });

        const data: unknown = await response.json();

        if (!response.ok) {
          const errorData = data as Record<string, unknown>;
          setError(typeof errorData["error"] === "string" ? errorData["error"] : "Worker failed");
          return;
        }

        const model = data as GraphModel;
        localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(model));
        saveToHistory(model, fileName);
        router.push("/graph");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Network error";
        setError(message);
      } finally {
        stopStepTicker();
        setLoading(false);
      }
    },
    [router, varsText, startStepTicker, stopStepTicker],
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const isZip = file.name.toLowerCase().endsWith(".zip");
      const fileName = file.name.replace(/\.(json|zip)$/i, "");
      pendingFileNameRef.current = fileName;

      if (isZip) {
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          const result = loadEvent.target?.result;
          if (result instanceof ArrayBuffer) {
            // Convert ArrayBuffer → base64 without using spread on large Uint8Array
            const bytes = new Uint8Array(result);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i] ?? 0);
            }
            void runAndRedirect(btoa(binary), fileName);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          const result = loadEvent.target?.result;
          if (typeof result === "string") {
            void parseAndRedirect(result, fileName);
          }
        };
        reader.readAsText(file);
      }
    },
    [parseAndRedirect, runAndRedirect],
  );

  return (
    <div className="upload-form">
      <div className="card upload-form__card">
        <label className={`upload-form__file-label${loading ? " upload-form__file-label--loading" : ""}`}>
          {loading ? (
            <svg className="upload-form__file-icon upload-form__file-icon--spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : (
            <svg className="upload-form__file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V8m0 0-3 3m3-3 3 3" />
              <path d="M20 16.5A3.5 3.5 0 0 0 16.5 13H15a5 5 0 1 0-9.9 1A4 4 0 0 0 4 20.5" />
            </svg>
          )}
          <span>{loading ? loadingLabel : "Choose a file to upload"}</span>
          <span className="upload-form__file-hint">.json (terraform show -json) or .zip (Terraform project)</span>
          <input
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            onChange={handleFileChange}
            className="upload-form__file-input"
            disabled={loading}
          />
        </label>

        {/* Optional -var flags — only relevant for zip uploads */}
        <div className="upload-form__vars-wrap">
          <button
            type="button"
            className="upload-form__vars-toggle"
            onClick={() => setVarsOpen((o) => !o)}
            aria-expanded={varsOpen}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points={varsOpen ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
            </svg>
            Terraform variables <span className="upload-form__vars-hint">(optional, zip upload only)</span>
          </button>
          {varsOpen && (
            <textarea
              className="upload-form__vars-textarea"
              value={varsText}
              onChange={(e) => setVarsText(e.target.value)}
              placeholder={"region=us-east-1\nenv=prod"}
              rows={4}
              spellCheck={false}
              disabled={loading}
            />
          )}
        </div>

        <div className="upload-form__divider">or paste JSON below</div>

        <textarea
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
          placeholder="Paste the output of `terraform show -json` here…"
          className="upload-form__textarea"
          rows={20}
          spellCheck={false}
        />

        {error !== null && <div className="error-banner">{error}</div>}

        <button
          className="btn btn--primary"
          onClick={() => {
            void parseAndRedirect(jsonText, pendingFileNameRef.current);
          }}
          disabled={loading || jsonText.trim().length === 0}
        >
          {loading ? loadingLabel : "Parse & Visualize"}
        </button>
      </div>

      <aside className="upload-form__hint card">
        <h3>How to generate plan JSON</h3>
        <pre className="upload-form__code">
          {`# Option A — upload a .zip of your Terraform project
#   (no pre-run required — the worker handles init + plan)
zip -r project.zip . -x ".terraform/*"

# Option B — generate plan JSON yourself
terraform plan -out=tfplan
terraform show -json tfplan > plan.json`}
        </pre>
      </aside>
    </div>
  );
}
