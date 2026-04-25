import { describe, it, expect, beforeEach, vi } from "vitest";
import { getStoredTheme, applyTheme, toggleTheme } from "../lib/theme-store";

// Functional localStorage mock (real store, no vi.fn needed for reads)
function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

const docElementMock = {
  getAttribute: vi.fn(() => "dark" as string | null),
  setAttribute: vi.fn(),
};

vi.stubGlobal("document", { documentElement: docElementMock });

let storage = makeLocalStorage();

beforeEach(() => {
  storage = makeLocalStorage();
  vi.stubGlobal("localStorage", storage);
  docElementMock.getAttribute.mockReturnValue("dark");
  docElementMock.setAttribute.mockClear();
});

describe("theme-store", () => {
  it("getStoredTheme defaults to dark", () => {
    expect(getStoredTheme()).toBe("dark");
  });

  it("getStoredTheme returns stored value", () => {
    storage.setItem("tf-viz:theme", "light");
    expect(getStoredTheme()).toBe("light");
  });

  it("applyTheme sets data-theme attribute", () => {
    applyTheme("light");
    expect(docElementMock.setAttribute).toHaveBeenCalledWith("data-theme", "light");
  });

  it("applyTheme persists to localStorage", () => {
    applyTheme("light");
    expect(storage.setItem).toHaveBeenCalledWith("tf-viz:theme", "light");
  });

  it("toggleTheme switches dark -> light", () => {
    docElementMock.getAttribute.mockReturnValue("dark");
    const next = toggleTheme();
    expect(next).toBe("light");
  });

  it("toggleTheme switches light -> dark", () => {
    docElementMock.getAttribute.mockReturnValue("light");
    const next = toggleTheme();
    expect(next).toBe("dark");
  });
});
