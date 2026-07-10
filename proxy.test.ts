import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, {
    headers: cookie ? { cookie } : {},
  });
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ENABLE_LOGIN = "true";
  process.env.NEXTCLOUD_URL = "https://cloud.example.com";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("proxy", () => {
  it("con NEXT_PUBLIC_ENABLE_LOGIN=false deja pasar sin comprobar cookie ni llamar a fetch", async () => {
    process.env.NEXT_PUBLIC_ENABLE_LOGIN = "false";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await proxy(makeRequest("http://localhost/pages/games/chess"));

    expect(res.status).toBe(200); // NextResponse.next() no es una redirección
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin cookie, redirige a /login sin llamar a fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await proxy(makeRequest("http://localhost/pages/games/chess"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con NEXT_PUBLIC_ENABLE_LOGIN=true pero sin NEXTCLOUD_URL, redirige a /login", async () => {
    delete process.env.NEXTCLOUD_URL;

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("si fetch a Nextcloud falla (red caída), redirige a /login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("si Nextcloud responde no-ok, redirige a /login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("si la respuesta de Nextcloud no es JSON válido, redirige a /login", async () => {
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
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("si el JSON no trae ocs.data.id, redirige a /login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ocs: { data: {} } })));

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("userId falsy pero no undefined (0) también redirige a /login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ocs: { data: { id: 0 } } })));

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("cookie válida con userId presente: deja pasar (next)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ocs: { data: { id: "u1" } } }))
    );

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(200);
  });
});
