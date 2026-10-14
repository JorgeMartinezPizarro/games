import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, {
    headers: cookie ? { cookie } : {},
  });
}

// Nextcloud login that, after signing in, opens chess inside the gaming app.
const LOGIN_CHESS =
  "https://cloud.example.com/login?redirect_url=%2Findex.php%2Fapps%2Fgaming%2Fpages%2Fgames%2Fchess";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  process.env.NEXTCLOUD_URL = "https://cloud.example.com";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("proxy", () => {
  it("there is no login-free mode anymore: an old .env with NEXT_PUBLIC_ENABLE_LOGIN=false and no cookie redirects to the Nextcloud login", async () => {
    process.env.NEXT_PUBLIC_ENABLE_LOGIN = "false";

    const res = await proxy(makeRequest("http://localhost/pages/games/chess"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGIN_CHESS);
  });

  it("without a cookie, redirects to the Nextcloud login without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await proxy(makeRequest("http://localhost/pages/games/chess"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGIN_CHESS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without NEXTCLOUD_URL there is nowhere to send the user: configuration error", async () => {
    delete process.env.NEXTCLOUD_URL;

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(500);
  });

  it("uses NEXTCLOUD_PUBLIC_URL (the one the browser sees) and keeps the query in the deeplink", async () => {
    process.env.NEXTCLOUD_URL = "http://nextcloud";
    process.env.NEXTCLOUD_PUBLIC_URL = "http://localhost:4480/";

    const res = await proxy(makeRequest("http://localhost/pages/games/tetris?x=1"));

    expect(res.headers.get("location")).toBe(
      "http://localhost:4480/login?redirect_url=%2Findex.php%2Fapps%2Fgaming%2Fpages%2Fgames%2Ftetris%3Fx%3D1"
    );
  });

  it("the home page without a session leads to the gaming app root", async () => {
    const res = await proxy(makeRequest("http://localhost/"));

    expect(res.headers.get("location")).toBe(
      "https://cloud.example.com/login?redirect_url=%2Findex.php%2Fapps%2Fgaming%2F"
    );
  });

  it("if fetch to Nextcloud fails (network down), redirects to the Nextcloud login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGIN_CHESS);
  });

  it("if Nextcloud responds non-ok, redirects to the Nextcloud login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGIN_CHESS);
  });

  it("if the Nextcloud response is not valid JSON, redirects to the Nextcloud login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response)
    );

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGIN_CHESS);
  });

  it("if the JSON has no ocs.data.id, redirects to the Nextcloud login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ocs: { data: {} } })));

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGIN_CHESS);
  });

  it("a falsy but not undefined userId (0) also redirects to the Nextcloud login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ocs: { data: { id: 0 } } })));

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGIN_CHESS);
  });

  it("valid cookie with a userId present: lets the request through (next)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ocs: { data: { id: "u1" } } }))
    );

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(200);
  });
});
