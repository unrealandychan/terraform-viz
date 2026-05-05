import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the use-case module before importing the router
vi.mock("../application/parse-plan.use-case.js", () => ({
  parsePlanUseCase: vi.fn(),
}));

import { parsePlanUseCase } from "../application/parse-plan.use-case.js";
import { parserRouter } from "../infrastructure/http/parser.routes.js";

// Helper to get the registered handler for a given method + path
function getHandler(method: "post" | "get", path: string) {
  const layer = (parserRouter.stack as Array<{ route?: { path: string; stack: Array<{ method: string; handle: Function }> } }>)
    .find((l) => l.route?.path === path && l.route.stack.some((s) => s.method === method));
  return layer?.route?.stack.find((s) => s.method === method)?.handle;
}

function makeMockRes() {
  const res: Record<string, unknown> = {};
  const statusFn = vi.fn().mockReturnValue(res);
  const jsonFn = vi.fn().mockReturnValue(res);
  res.status = statusFn;
  res.json = jsonFn;
  return { res, statusFn, jsonFn };
}

describe("POST /parse handler", () => {
  const mockParsePlan = vi.mocked(parsePlanUseCase);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responds 200 with graph model on success", () => {
    const graphModel = { nodes: [{ id: "1" }], edges: [] };
    mockParsePlan.mockReturnValue({ success: true, data: graphModel as never });

    const handler = getHandler("post", "/parse");
    expect(handler).toBeDefined();

    const req = { body: { format_version: "1.0", resource_changes: [] } };
    const { res, statusFn, jsonFn } = makeMockRes();

    handler!(req, res, vi.fn());

    expect(statusFn).toHaveBeenCalledWith(200);
    expect(jsonFn).toHaveBeenCalledWith(graphModel);
  });

  it("responds 400 when use case returns error", () => {
    mockParsePlan.mockReturnValue({ success: false, error: "Missing format_version" });

    const handler = getHandler("post", "/parse");
    const req = { body: { resource_changes: [] } };
    const { res, statusFn, jsonFn } = makeMockRes();

    handler!(req, res, vi.fn());

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(jsonFn).toHaveBeenCalledWith({ error: "Missing format_version" });
  });

  it("responds 400 with validation error when body is not a record", () => {
    const handler = getHandler("post", "/parse");
    // Arrays fail zod record validation
    const req = { body: ["not", "a", "record"] };
    const { res, statusFn, jsonFn } = makeMockRes();

    handler!(req, res, vi.fn());

    expect(statusFn).toHaveBeenCalledWith(400);
    const jsonArg = (jsonFn.mock.calls[0] as Array<unknown>)[0] as Record<string, unknown>;
    expect(jsonArg).toHaveProperty("error", "Validation failed");
  });
});

describe("GET /health handler", () => {
  it("responds 200 with status ok", () => {
    const handler = getHandler("get", "/health");
    expect(handler).toBeDefined();

    const req = {};
    const { res, statusFn, jsonFn } = makeMockRes();

    handler!(req, res, vi.fn());

    expect(statusFn).toHaveBeenCalledWith(200);
    expect(jsonFn).toHaveBeenCalledWith({ status: "ok", service: "parser" });
  });
});
