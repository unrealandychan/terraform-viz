import type { GraphModel } from "@terraform-viz/graph-schema";

async function compressToBase64(data: string): Promise<string> {
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  writer.write(new TextEncoder().encode(data));
  writer.close();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  // URL-safe base64 (no padding)
  let binary = "";
  for (let i = 0; i < result.length; i++) binary += String.fromCharCode(result[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function decompressFromBase64(encoded: string): Promise<string> {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (base64.length % 4)) % 4;
  const binary = atob(base64 + "=".repeat(padding));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  writer.write(bytes);
  writer.close();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(result);
}

/** Compress and base64-encode a plan model for embedding in a URL param. */
export async function encodePlan(model: GraphModel): Promise<string> {
  return compressToBase64(JSON.stringify(model));
}

/** Decode a URL-encoded plan back to a GraphModel. */
export async function decodePlan(encoded: string): Promise<GraphModel> {
  const json = await decompressFromBase64(encoded);
  return JSON.parse(json) as GraphModel;
}

export const PLAN_URL_PARAM = "plan";
