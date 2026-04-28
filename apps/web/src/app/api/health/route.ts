import { NextResponse } from "next/server";

// Tauri desktop build: API routes unused (Tauri IPC handles all backend calls)
export const dynamic = "force-static";

export function GET(): NextResponse {
  return NextResponse.json({ status: "ok", service: "web" });
}
