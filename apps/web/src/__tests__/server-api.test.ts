import { describe, it, expect, vi, afterEach } from "vitest";
import { parsePlan, runPlan } from "../lib/server-api.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeResponse(body: unknown, ok: boolean, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("parsePlan", () => {
  it("returns success with GraphModel on 200 response", async () => {
    const mockGraph = { nodes: [], edges: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(mockGraph, true, 200)));

    const result = await parsePlan({ format_version: "1.0" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(mockGraph);
    }
  });

  it("returns error when response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeResponse({ error: "Invalid plan format" }, false, 400)),
    );

    const result = await parsePlan({ bad: "data" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Invalid plan format");
    }
  });

  it("returns generic error message when error body has no error field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeResponse({ message: "something went wrong" }, false, 500)),
    );

    const result = await parsePlan({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Parse failed");
    }
  });

  it("returns error on network failure (fetch throws)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unreachable")));

    const result = await parsePlan({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Network unreachable");
    }
  });

  it("returns 'Network error' for non-Error thrown values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("some string error"));

    const result = await parsePlan({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Network error");
    }
  });
});

describe("runPlan", () => {
  it("returns success when worker and parser both succeed", async () => {
    const mockPlan = { format_version: "1.0" };
    const mockGraph = { nodes: [], edges: [] };

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // First call: worker /run
        .mockResolvedValueOnce(makeResponse({ plan: mockPlan }, true, 200))
        // Second call: parser /parse
        .mockResolvedValueOnce(makeResponse(mockGraph, true, 200)),
    );

    const result = await runPlan("dGVzdA==");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(mockGraph);
    }
  });

  it("returns error when worker responds with non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeResponse({ error: "Worker busy" }, false, 503)),
    );

    const result = await runPlan("dGVzdA==");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Worker busy");
    }
  });

  it("returns error when worker returns no plan JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeResponse({ plan: null }, true, 200)),
    );

    const result = await runPlan("dGVzdA==");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Worker returned no plan JSON");
    }
  });

  it("returns error on worker network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await runPlan("dGVzdA==");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("ECONNREFUSED");
    }
  });

  it("passes vars to worker request body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({ plan: { data: true } }, true, 200))
      .mockResolvedValueOnce(makeResponse({ nodes: [], edges: [] }, true, 200));

    vi.stubGlobal("fetch", fetchMock);

    await runPlan("dGVzdA==", ["region=us-east-1", "env=prod"]);

    const firstCall = fetchMock.mock.calls[0];
    const body = JSON.parse((firstCall[1] as RequestInit).body as string);
    expect(body.vars).toEqual(["region=us-east-1", "env=prod"]);
  });
});
