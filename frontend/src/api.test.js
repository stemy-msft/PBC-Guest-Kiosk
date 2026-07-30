import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getUsers } from "./api";

// getUsers() routes through the shared handleResponse(). Exercising it lets us
// assert the shared 401-vs-403 behavior against a real exported API function
// (rather than testing a private helper in isolation).
describe("shared API response handling (401 vs 403)", () => {
  let reloadMock;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("access_token", "token-123");
    localStorage.setItem("username", "alice");
    localStorage.setItem("role", "Administrator");

    reloadMock = vi.fn();
    // jsdom does not implement window.location.reload(); replace location with
    // a plain object exposing a mock so handleUnauthorized() can call reload().
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: reloadMock },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("on 401 clears the stored session and returns the user to the main screen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 401,
        ok: false,
        json: async () => ({ detail: "Invalid token" }),
      }))
    );

    await expect(getUsers()).rejects.toThrow();

    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("username")).toBeNull();
    expect(localStorage.getItem("role")).toBeNull();
    expect(sessionStorage.getItem("session_expired_message")).toBe(
      "Your session expired. Please sign in again."
    );
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("on 403 preserves the session and surfaces a permission error instead of logging out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 403,
        ok: false,
        json: async () => ({ detail: "Not permitted" }),
      }))
    );

    await expect(getUsers()).rejects.toThrow("Not permitted");

    // Auth state must remain intact: no silent logout / reload on 403.
    expect(localStorage.getItem("access_token")).toBe("token-123");
    expect(localStorage.getItem("username")).toBe("alice");
    expect(localStorage.getItem("role")).toBe("Administrator");
    expect(sessionStorage.getItem("session_expired_message")).toBeNull();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("on a non-auth error surfaces the backend detail without touching the session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 500,
        ok: false,
        json: async () => ({ detail: "Boom" }),
      }))
    );

    await expect(getUsers()).rejects.toThrow("Boom");
    expect(localStorage.getItem("access_token")).toBe("token-123");
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
