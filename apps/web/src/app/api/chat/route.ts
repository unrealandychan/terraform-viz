import { NextRequest } from "next/server";

// Tauri desktop build: API routes unused (Tauri IPC handles all backend calls)
export const dynamic = "force-static";

export const runtime = "nodejs";

interface RequestBody {
  messages: { role: string; content: string }[];
  // Fallback values from client localStorage — server env vars take priority
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages array is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Server env vars take priority over client-provided values (from localStorage).
  // This means: set LLM_API_KEY in .env and the client never needs to handle the key.
  const apiKey = process.env.LLM_API_KEY || body.apiKey || "";
  const rawBase = process.env.OPENAI_BASE_URL || body.baseUrl || "https://api.openai.com/v1";
  const baseUrl = rawBase.replace(/\/$/, "");
  const model = process.env.LLM_MODEL || process.env.OPENAI_MODEL || body.model || "gpt-4o-mini";

  // Require a key for non-local endpoints
  if (!apiKey && !baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1")) {
    return new Response(
      JSON.stringify({
        error:
          "No API key configured. Set LLM_API_KEY in .env or add it in Settings.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: body.messages,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upstream connection failed";
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(JSON.stringify({ error: `Upstream ${upstream.status}: ${errText}` }), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Stream the SSE response straight through
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
