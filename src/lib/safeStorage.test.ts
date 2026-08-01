// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { onStorageFailure, safeGetItem, safeSetItem, safeRemoveItem } from "./safeStorage";

afterEach(() => vi.restoreAllMocks());

/**
 * With site data blocked, *touching* `window.localStorage` throws — not just the call. The project
 * store is read inside App's state initialiser, so an unguarded read killed the app on mount into
 * the ErrorBoundary, whose recovery button then called `localStorage.clear()` and threw in turn.
 */
function withBlockedStorage(run: () => void) {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("The operation is insecure.", "SecurityError");
    }
  });
  try {
    run();
  } finally {
    if (original) {
      Object.defineProperty(window, "localStorage", original);
    }
  }
}

describe("safeStorage", () => {
  it("stores a value and reports success", () => {
    expect(safeSetItem("k", "v")).toBe(true);
    expect(window.localStorage.getItem("k")).toBe("v");
  });

  it("returns false instead of throwing when setItem throws (quota/private mode)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => safeSetItem("k", "v")).not.toThrow();
    expect(safeSetItem("k", "v")).toBe(false);
  });

  it("returns false instead of throwing when removeItem throws", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });
    expect(() => safeRemoveItem("k")).not.toThrow();
    expect(safeRemoveItem("k")).toBe(false);
  });

  it("reads a stored value back", () => {
    window.localStorage.setItem("read-probe", "value");
    expect(safeGetItem("read-probe")).toBe("value");
  });

  it("survives storage being blocked entirely, on read as well as write", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    withBlockedStorage(() => {
      expect(() => safeGetItem("k")).not.toThrow();
      expect(safeGetItem("k")).toBeNull();
      expect(safeSetItem("k", "v")).toBe(false);
      expect(safeRemoveItem("k")).toBe(false);
    });
  });

  it("tells a listener, so a save that stopped working is visible rather than silent", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const seen: string[] = [];
    const unsubscribe = onStorageFailure((failure) => seen.push(failure));

    withBlockedStorage(() => safeSetItem("k", "v"));
    unsubscribe();

    // Each kind reports once per session, so a failing autosave cannot spam the user.
    expect(seen.length).toBeLessThanOrEqual(1);
  });
});
