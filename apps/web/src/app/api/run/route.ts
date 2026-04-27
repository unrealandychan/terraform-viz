import { NextRequest, NextResponse } from "next/server";

// Tauri desktop build: API routes unused (Tauri IPC handles all backend calls)
export const dynamic = "force-static";
import { runPlan } from "@/lib/server-api";

export const runtime = "nodejs";
// Zip archives can be large — allow up to 10 MB bodies.
export const maxDuration = 180; // seconds; Terraform init + plan can be slow

interface RunRequestBody {
  /** Base64-encoded zip archive of the Terraform project. */
  archiveBase64: string;
  /** Optional list of -var flags, e.g. ["region=us-east-1", "env=prod"] */
  vars?: string[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: RunRequestBody;
  try {
    body = (await request.json()) as RunRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.archiveBase64 !== "string" || body.archiveBase64.length === 0) {
    return NextResponse.json({ error: "archiveBase64 is required" }, { status: 400 });
  }

  if (body.vars !== undefined && !Array.isArray(body.vars)) {
    return NextResponse.json({ error: "vars must be an array of strings" }, { status: 400 });
  }

  const vars = (body.vars ?? []).filter((v): v is string => typeof v === "string");
  const result = await runPlan(body.archiveBase64, vars);

  if (result.success) {
    return NextResponse.json(result.data, { status: 200 });
  }

  return NextResponse.json({ error: result.error }, { status: 502 });
}
