import type { GraphModel } from "@terraform-viz/graph-schema";

// Tauri desktop build: API routes unused (Tauri IPC handles all backend calls)
export const dynamic = "force-static";
import { NextRequest, NextResponse } from "next/server";
import { parsePlan } from "@/lib/server-api";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json();
  const result = await parsePlan(body);

  if (result.success) {
    return NextResponse.json(result.data, { status: 200 });
  }

  return NextResponse.json({ error: result.error }, { status: 400 });
}

// Silence unused import warning — GraphModel is referenced in the return type below
type _GraphModelRef = GraphModel;
