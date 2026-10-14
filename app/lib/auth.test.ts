import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAuth } from "./auth";

// requireAuth is always fully mocked in the route tests
// (vi.mock("@/app/lib/auth", ...)), so its own logic (60s per-cookie
// cache, parsing the Nextcloud payload, errors) had never
// run in any test.

function makeRequest(cookie?: string): Request {
  return {
    headers: {
      get: (key: string) => (key.toLowerCase() === "cookie" ? cookie ?? null : null),
    },
  } as unknown as Request;
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  process.env.NEXTCLOUD_URL = "https://cloud.example.com";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("requireAuth", () => {
  it("there is no login-free mode anymore: an old .env with NEXT_PUBLIC_ENABLE_LOGIN=false does not bypass the session", async () => {
    process.env.NEXT_PUBLIC_ENABLE_LOGIN = "false";
    process.env.NEXT_PUBLIC_DEV_USER = "peter";

    await expect(requireAuth(makeRequest())).rejects.toThrow("No session cookie");
  });

  it("throws 'No session cookie' if there is no cookie", async () => {
    await expect(requireAuth(makeRequest())).rejects.toThrow("No session cookie");
  });

  it("throws if NEXTCLOUD_URL is missing", async () => {
    delete process.env.NEXTCLOUD_URL;
    await expect(requireAuth(makeRequest("session=abc-missing-url"))).rejects.toThrow(
      "Server misconfigured: missing NEXTCLOUD_URL"
    );
  });

  it("throws 'Nextcloud unreachable' if fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    await expect(requireAuth(makeRequest("session=abc-unreachable"))).rejects.toThrow(
      "Nextcloud unreachable"
    );
  });

  it("throws 'Invalid Nextcloud session' if the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));
    await expect(requireAuth(makeRequest("session=abc-invalid"))).rejects.toThrow(
      "Invalid Nextcloud session"
    );
  });

  it("throws 'Invalid user profile' if the payload has no id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ocs: { data: {} } })));
    await expect(requireAuth(makeRequest("session=abc-no-id"))).rejects.toThrow(
      "Invalid user profile"
    );
  });

  it("parses displayname/email/id with the correct priorities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ ocs: { data: { id: 7, displayname: "  Ada  ", email: " ada@x.com " } } })
      )
    );
    const user = await requireAuth(makeRequest("session=abc-full"));
    expect(user).toEqual({ id: "7", name: "Ada", email: "ada@x.com" });
  });

  it("falls back to email and then to id when displayname is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ocs: { data: { id: "u1", email: "u1@x.com" } } }))
    );
    const withEmail = await requireAuth(makeRequest("session=abc-fallback-email"));
    expect(withEmail.name).toBe("u1@x.com");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ocs: { data: { id: "u2" } } }))
    );
    const withIdOnly = await requireAuth(makeRequest("session=abc-fallback-id"));
    expect(withIdOnly.name).toBe("u2");
    expect(withIdOnly.email).toBe("u2");
  });

  it("caches the user for 60s per cookie: a second call within that window does not call fetch again", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ocs: { data: { id: "cached-user" } } }));
    vi.stubGlobal("fetch", fetchMock);

    const cookie = "session=abc-cache-hit";
    const first = await requireAuth(makeRequest(cookie));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(59_000);
    const second = await requireAuth(makeRequest(cookie));

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still cached, no second call
  });

  it("expires the cache after 60s: past that window, it calls fetch again", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ocs: { data: { id: "expiring-user" } } }));
    vi.stubGlobal("fetch", fetchMock);

    const cookie = "session=abc-cache-expiry";
    await requireAuth(makeRequest(cookie));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(60_001);
    await requireAuth(makeRequest(cookie));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
