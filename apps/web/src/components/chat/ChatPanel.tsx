"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
  Fragment,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";

const SETTINGS_KEY = "terraform-viz:llm-settings";

interface LlmSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const DEFAULT_SETTINGS: LlmSettings = { baseUrl: "", apiKey: "", model: "gpt-4o-mini" };

const SYSTEM_PROMPT =
  "You are a knowledgeable Terraform infrastructure assistant. " +
  "Help users understand their Terraform plans, explain resource configurations, " +
  "estimate costs, identify potential issues, and answer questions about AWS, GCP, " +
  "Azure, and other cloud providers. Be concise and practical. " +
  "IMPORTANT: Always format your responses as a well-structured Markdown report. " +
  "Use headings (## / ###), bullet lists, bold for key terms, and fenced code blocks for resource names or JSON. " +
  "End every report with a ## Summary section containing 3-5 bullet-point takeaways. " +
  "Your output should be copy-paste ready as a .md file.";

// ── Preset analysis templates ─────────────────────────────────────────────
export interface Preset {
  id: string;
  icon: string;
  title: string;
  description: string;
  buildPrompt: (plan: GraphModel | null, node: GraphNode | null) => string;
}

function planContext(plan: GraphModel | null): string {
  if (!plan) return "\n(No plan loaded — answer based on general Terraform best practices.)";
  const summary = {
    terraformVersion: plan.terraformVersion,
    totalResources: plan.nodes.length,
    resources: plan.nodes.map((n) => ({
      name: n.name,
      type: n.type,
      provider: n.provider,
      layer: n.layer,
      changeAction: n.changeAction,
    })),
  };
  return `\n\nLoaded plan (JSON):\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\``;
}

function nodeContext(node: GraphNode | null): string {
  if (!node) return "";
  return `\n\nFocused resource:\n\`\`\`json\n${JSON.stringify(
    {
      name: node.name,
      type: node.type,
      provider: node.provider,
      layer: node.layer,
      changeAction: node.changeAction,
      address: node.address,
      attributes: node.attributes,
    },
    null,
    2,
  )}\n\`\`\``;
}

const MD_REPORT_FOOTER =
  "\n\n---\n" +
  "**Format instructions:** Structure your entire response as a Markdown report with ## headings, " +
  "bullet lists, bold key terms, and code blocks for resource names. " +
  "Close with a `## Summary` section of 3–5 bullet takeaways. " +
  "The output must be valid Markdown, ready to save as a `.md` file.";

export const PRESETS: Preset[] = [
  {
    id: "cost-saving",
    icon: "💰",
    title: "Cost Saving Plan",
    description: "Find waste, rank by spend, suggest cheaper alternatives",
    buildPrompt: (plan) =>
      `Analyze this Terraform plan for cost optimization opportunities.\n` +
      `1. List resources by estimated monthly cost (highest first).\n` +
      `2. Identify wasteful or over-provisioned configurations.\n` +
      `3. Suggest specific cheaper alternatives with estimated savings.\n` +
      `4. Highlight any resources that could use Reserved Instances or Savings Plans.\n` +
      planContext(plan) + MD_REPORT_FOOTER,
  },
  {
    id: "security",
    icon: "🔒",
    title: "Security Review",
    description: "Check for open ports, unencrypted storage, IAM issues",
    buildPrompt: (plan) =>
      `Perform a security review of this Terraform plan. Check for:\n` +
      `1. Overly permissive security groups or firewall rules (0.0.0.0/0).\n` +
      `2. Unencrypted storage volumes, databases, or S3 buckets.\n` +
      `3. Public access misconfigurations (public IPs, public S3 buckets).\n` +
      `4. Missing logging or audit trails (CloudTrail, VPC flow logs).\n` +
      `5. IAM over-permissioning or use of root credentials.\n` +
      `Rate overall risk as Low / Medium / High and list action items.\n` +
      planContext(plan) + MD_REPORT_FOOTER,
  },
  {
    id: "architecture",
    icon: "🏗️",
    title: "Architecture Overview",
    description: "Plain-English summary of what this infra does",
    buildPrompt: (plan) =>
      `Give me a plain-English architecture overview of this Terraform plan.\n` +
      `Cover: what the infrastructure does, its main layers, how components connect, ` +
      `and any notable design patterns used.\n` +
      planContext(plan) + MD_REPORT_FOOTER,
  },
  {
    id: "destruction",
    icon: "⚠️",
    title: "Destruction Risk",
    description: "Assess the impact of deletes and replacements",
    buildPrompt: (plan) =>
      `Identify all resources marked for deletion or replacement in this plan.\n` +
      `For each one: explain the blast radius, what data or services could be lost, ` +
      `whether the action is reversible, and whether any precautions should be taken before applying.\n` +
      planContext(plan) + MD_REPORT_FOOTER,
  },
  {
    id: "tagging",
    icon: "🏷️",
    title: "Naming & Tagging Audit",
    description: "Spot inconsistent names and missing cost-allocation tags",
    buildPrompt: (plan) =>
      `Audit the naming conventions and tag usage in this Terraform plan.\n` +
      `1. Identify resources missing standard tags (environment, owner, cost-center, project).\n` +
      `2. Flag naming inconsistencies (mixed cases, unclear abbreviations).\n` +
      `3. Suggest a consistent tagging and naming strategy.\n` +
      planContext(plan) + MD_REPORT_FOOTER,
  },
  {
    id: "deletions",
    icon: "🗑️",
    title: "Deletion Analysis",
    description: "Explain every resource marked for deletion",
    buildPrompt: (plan) => {
      const deleted = plan?.nodes.filter((n) => n.changeAction === "DELETE") ?? [];
      const ctx = planContext(plan);
      if (deleted.length === 0)
        return `No resources are marked for deletion in this plan. Confirm this looks correct and explain what the plan does instead.${ctx}${MD_REPORT_FOOTER}`;
      return (
        `The following ${deleted.length} resource(s) are marked for **deletion**:\n` +
        deleted.map((n) => `- \`${n.type}.${n.name}\``).join("\n") +
        `\n\nFor each one:\n` +
        `1. Explain what the resource does and why its removal matters.\n` +
        `2. Is this deletion reversible? Will any data be permanently lost?\n` +
        `3. Are there dependent resources that will be affected?\n` +
        `4. What precautions should be taken before applying?\n` +
        ctx + MD_REPORT_FOOTER
      );
    },
  },
  {
    id: "replacements",
    icon: "♻️",
    title: "Replace Risk Assessment",
    description: "Understand the downtime and data risk of in-place replacements",
    buildPrompt: (plan) => {
      const replaced = plan?.nodes.filter((n) => n.changeAction === "REPLACE") ?? [];
      const ctx = planContext(plan);
      if (replaced.length === 0)
        return `No resources are marked for replacement in this plan. Confirm this looks correct.${ctx}${MD_REPORT_FOOTER}`;
      return (
        `The following ${replaced.length} resource(s) will be **destroyed and recreated** (replace):\n` +
        replaced.map((n) => `- \`${n.type}.${n.name}\``).join("\n") +
        `\n\nFor each resource:\n` +
        `1. Why does Terraform need to replace it rather than update in place?\n` +
        `2. Expected downtime during the replacement window.\n` +
        `3. Any data that will be lost (e.g. EBS volume, RDS instance).\n` +
        `4. Recommended mitigation (e.g. snapshots, blue/green swap, lifecycle ignore_changes).\n` +
        ctx + MD_REPORT_FOOTER
      );
    },
  },
  {
    id: "noops",
    icon: "✅",
    title: "No-op Verification",
    description: "Confirm unchanged resources are correct and complete",
    buildPrompt: (plan) => {
      const noops = plan?.nodes.filter((n) => n.changeAction === "NO_OP") ?? [];
      const ctx = planContext(plan);
      if (noops.length === 0)
        return `Every resource in this plan has a change. Summarise what will happen when applied.${ctx}${MD_REPORT_FOOTER}`;
      return (
        `The following ${noops.length} resource(s) are **no-ops** (no planned changes):\n` +
        noops.map((n) => `- \`${n.type}.${n.name}\``).join("\n") +
        `\n\nPlease:\n` +
        `1. Confirm these look correct — are there any that *should* be changing but aren't?\n` +
        `2. Flag any no-op resources with configurations that look risky or outdated.\n` +
        `3. Highlight any that have significant cost implications worth reviewing.\n` +
        ctx + MD_REPORT_FOOTER
      );
    },
  },
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

// ── Lightweight markdown renderer (no external deps) ─────────────────────

/** Parse inline markdown: **bold**, *italic*, `code`, ~~strike~~, [link](url) */
function inlineMd(text: string, baseKey = 0): ReactNode {
  const patterns: [RegExp, (m: RegExpMatchArray, k: number) => ReactNode][] = [
    [/\*\*(.+?)\*\*/s,             (m, k) => <strong key={k}>{inlineMd(m[1], k * 100)}</strong>],
    [/__(.+?)__/s,                  (m, k) => <strong key={k}>{inlineMd(m[1], k * 100)}</strong>],
    [/\*(.+?)\*/s,                  (m, k) => <em key={k}>{inlineMd(m[1], k * 100)}</em>],
    [/_([^_\s][^_]*)_/s,            (m, k) => <em key={k}>{inlineMd(m[1], k * 100)}</em>],
    [/~~(.+?)~~/s,                  (m, k) => <del key={k}>{m[1]}</del>],
    [/`([^`]+)`/,                   (m, k) => <code key={k}>{m[1]}</code>],
    [/\[([^\]]+)\]\(([^)]+)\)/,     (m, k) => <a key={k} href={m[2]} target="_blank" rel="noopener noreferrer">{m[1]}</a>],
  ];

  const nodes: ReactNode[] = [];
  let rest = text;
  let ki = baseKey;

  while (rest.length > 0) {
    let best: { idx: number; len: number; node: ReactNode } | null = null;
    for (const [pattern, render] of patterns) {
      const m = pattern.exec(rest);
      if (m && (best === null || m.index < best.idx)) {
        best = { idx: m.index, len: m[0].length, node: render(m, ki++) };
      }
    }
    if (!best) { nodes.push(rest); break; }
    if (best.idx > 0) nodes.push(rest.slice(0, best.idx));
    nodes.push(best.node);
    rest = rest.slice(best.idx + best.len);
  }

  return nodes.length === 1 ? nodes[0] : nodes;
}

/** Parse block-level markdown into React nodes */
function parseMarkdown(md: string): ReactNode {
  const lines = md.split("\n");
  const result: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (!line.trim()) { i++; continue; }

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { code.push(lines[i]); i++; }
      i++;
      result.push(
        <pre key={key++}>
          <code className={lang ? `language-${lang}` : undefined}>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // ATX Heading
    const hm = /^(#{1,4})\s+(.+)$/.exec(line);
    if (hm) {
      const lvl = hm[1].length;
      const Tag = `h${lvl}` as "h1" | "h2" | "h3" | "h4";
      result.push(<Tag key={key++}>{inlineMd(hm[2])}</Tag>);
      i++; continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      result.push(<hr key={key++} />);
      i++; continue;
    }

    // Blockquote
    if (line.startsWith("> ") || line === ">") {
      const qlines: string[] = [];
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i] === ">")) {
        qlines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      result.push(
        <blockquote key={key++}>
          {qlines.map((l, j) => <p key={j}>{inlineMd(l)}</p>)}
        </blockquote>,
      );
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ""));
        i++;
      }
      result.push(
        <ul key={key++}>{items.map((item, j) => <li key={j}>{inlineMd(item)}</li>)}</ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      result.push(
        <ol key={key++}>{items.map((item, j) => <li key={j}>{inlineMd(item)}</li>)}</ol>,
      );
      continue;
    }

    // Paragraph — collect until blank line or block element
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("> ") &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^(\*{3,}|-{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      result.push(
        <p key={key++}>
          {paraLines.map((l, j) => (
            <Fragment key={j}>{j > 0 && <br />}{inlineMd(l)}</Fragment>
          ))}
        </p>,
      );
    }
  }

  return result;
}

// ── StreamingBubble — isolated component, only re-renders when streaming text changes ──
// Renders raw pre-wrap text during streaming to avoid running the expensive
// parseMarkdown() on every rAF frame. The committed MessageBubble renders
// the fully-parsed markdown once streaming is done.
function StreamingBubble({ content }: { content: string }) {
  return (
    <div className="chat-msg chat-msg--assistant">
      <span className="chat-msg__label">AI</span>
      <div className="chat-msg__content">
        {content === "" ? (
          <span className="chat-msg__cursor" aria-label="Thinking" />
        ) : (
          <div className="chat-msg__markdown">
            <pre className="chat-msg__streaming-raw">{content}</pre>
            <span className="chat-msg__cursor" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── MessageBubble — memoized so committed messages never re-render during streaming ──
const MessageBubble = memo(function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);
  const rendered = useMemo(() => (isUser ? null : parseMarkdown(msg.content)), [isUser, msg.content]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [msg.content]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([msg.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [msg.content]);

  return (
    <div className={`chat-msg chat-msg--${msg.role}`}>
      <span className="chat-msg__label">{isUser ? "You" : "AI"}</span>
      <div className="chat-msg__content">
        {isUser ? (
          <span className="chat-msg__plain">{msg.content}</span>
        ) : (
          <div className="chat-msg__markdown">{rendered}</div>
        )}
      </div>
      {!isUser && msg.content && (
        <div className="chat-msg__actions">
          <button className="chat-msg__action-btn" onClick={handleCopy} title="Copy markdown">
            {copied ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8l4 4 8-8" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5" y="1" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><rect x="1" y="4" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="var(--color-surface)"/></svg>
            )}
            {copied ? "Copied!" : "Copy"}
          </button>
          <button className="chat-msg__action-btn" onClick={handleDownload} title="Download as .md">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Download .md
          </button>
        </div>
      )}
    </div>
  );
});

// ── ChatPanel ─────────────────────────────────────────────────────────────
export interface ChatPanelProps {
  /** When embedded in the graph page: the currently selected node */
  nodeContext?: GraphNode | null;
  /** Loaded plan, used for preset prompts */
  plan?: GraphModel | null;
  /** Compact mode: hides preset grid, smaller empty state */
  compact?: boolean;
}

function _ChatPanel({ nodeContext = null, plan = null, compact = false }: ChatPanelProps) {
  const [settings, setSettings] = useState<LlmSettings>(DEFAULT_SETTINGS);
  // Committed messages only. Never mutated mid-stream.
  // Streaming text is isolated in streamingContent, so memoized MessageBubbles never re-render
  // while tokens arrive.
  const [messages, setMessages] = useState<Message[]>([]);
  // Mirror used inside sendMessage to avoid capturing stale `messages` closure.
  const messagesRef = useRef<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Streaming text lives in its own state so only StreamingBubble re-renders each rAF frame.
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Raw accumulator; never triggers a render by itself.
  const streamAccRef = useRef("");
  const rafRef = useRef<number | null>(null);
  // Ref guards so sendMessage doesn't need loading/settings in its dep array.
  const loadingRef = useRef(false);
  const settingsRef = useRef(settings);

  // Keep refs in sync without causing extra renders.
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // Scroll to bottom when a committed message arrives.
  useEffect(() => {
    const t = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 80);
    return () => clearTimeout(t);
  }, [messages]);

  // Also scroll to bottom during streaming so the growing bubble stays in view.
  // streamingContent is already rAF-throttled (≤60 updates/s), so this is safe.
  useEffect(() => {
    if (streamingContent === null) return;
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [streamingContent]);

  const sendMessage = useCallback(
    async (overrideContent?: string) => {
      const content = (overrideContent ?? input).trim();
      if (!content || loadingRef.current) return;

      const userMsg: Message = { id: crypto.randomUUID(), role: "user", content };
      const assistantId = crypto.randomUUID();

      // Commit user message. No streaming placeholder in the committed list.
      const nextMessages = [...messagesRef.current, userMsg];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);

      setInput("");
      loadingRef.current = true;
      setLoading(true);
      setStreamingContent("");  // mount streaming bubble
      setError(null);
      streamAccRef.current = "";
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      try {
        const s = settingsRef.current;
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: s.model,
            baseUrl: s.baseUrl,
            apiKey: s.apiKey,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...messagesRef.current.map((m) => ({ role: m.role, content: m.content })),
            ],
          }),
        });

        if (!response.ok) {
          const errJson = (await response.json()) as { error?: string };
          throw new Error(errJson.error ?? `HTTP ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;
            if (!trimmed.startsWith("data: ")) continue;
            try {
              const json = JSON.parse(trimmed.slice(6)) as {
                choices?: { delta?: { content?: string } }[];
              };
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                streamAccRef.current += delta;
                // Update only StreamingBubble via rAF; committed list untouched.
                if (!rafRef.current) {
                  rafRef.current = requestAnimationFrame(() => {
                    setStreamingContent(streamAccRef.current);
                    rafRef.current = null;
                  });
                }
              }
            } catch {
              // ignore malformed SSE chunks
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
      } finally {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        const finalText = streamAccRef.current;
        if (finalText) {
          // Commit completed AI message into the stable list.
          const committed: Message = { id: assistantId, role: "assistant", content: finalText };
          const withAssistant = [...messagesRef.current, committed];
          messagesRef.current = withAssistant;
          setMessages(withAssistant);
        }
        setStreamingContent(null);  // unmount streaming bubble
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [input],  // only input; everything else is accessed via refs
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage],
  );

  const handleInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }, []);

  const askAboutNode = useCallback(() => {
    if (!nodeContext) return;
    const prompt =
      `Tell me about the Terraform resource "${nodeContext.name}" (${nodeContext.type}).\n` +
      `Explain what it does, typical configuration pitfalls, estimated cost if applicable, ` +
      `and any security considerations.\n` +
      nodeContext_(nodeContext);
    void sendMessage(prompt);
  }, [nodeContext, sendMessage]);

  return (
    <div className="chat-panel">
      {/* Node context card — shown when a node is selected */}
      {nodeContext && (
        <div className="chat-panel__node-ctx">
          <div className="chat-panel__node-ctx-info">
            <span className="chat-panel__node-ctx-name">{nodeContext.name}</span>
            <span className="chat-panel__node-ctx-type">{nodeContext.type}</span>
          </div>
          <button
            className="btn btn--secondary chat-panel__node-ctx-btn"
            onClick={askAboutNode}
            disabled={loading}
          >
            Ask about this
          </button>
        </div>
      )}

      <div className="chat-panel__messages">
        {messages.length === 0 && streamingContent === null && (
          <div className={`chat-page__empty${compact ? " chat-page__empty--compact" : ""}`}>
            <svg
              className="chat-page__empty-icon"
              width={compact ? 28 : 40}
              height={compact ? 28 : 40}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            {compact ? (
              <p className="chat-page__empty-text">
                {nodeContext ? `Ask about ${nodeContext.name} or choose a preset below.` : "Ask anything about your infrastructure."}
              </p>
            ) : (
              <p className="chat-page__empty-text">Choose an analysis or ask your own question.</p>
            )}
            <div className={`chat-page__presets${compact ? " chat-page__presets--compact" : ""}`}>
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className="chat-preset"
                  onClick={() => void sendMessage(p.buildPrompt(plan, nodeContext))}
                  disabled={loading}
                >
                  <span className="chat-preset__icon">{p.icon}</span>
                  <span className="chat-preset__body">
                    <span className="chat-preset__title">{p.title}</span>
                    {!compact && <span className="chat-preset__desc">{p.description}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* Streaming bubble is isolated — re-renders only affect this one component */}
        {streamingContent !== null && <StreamingBubble content={streamingContent} />}

        {error && <div className="chat-page__error">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="chat-panel__input-area">
        <textarea
          ref={textareaRef}
          className="chat-page__input"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask… (Enter sends, Shift+Enter for newline)"
          rows={1}
          disabled={loading}
          spellCheck={false}
        />
        <button
          className="btn btn--primary chat-page__send"
          onClick={() => void sendMessage()}
          disabled={loading || !input.trim()}
          aria-label="Send"
        >
          {loading ? (
            <span className="chat-page__spinner" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// named helper used inside component (avoids naming conflict with prop)
function nodeContext_(node: GraphNode): string {
  return nodeContext(node);
}

// Re-exported as memo so parent re-renders (e.g. baseline pin) don't cascade into ChatPanel.
export const ChatPanel = memo(_ChatPanel);
