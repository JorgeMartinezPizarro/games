import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, {
    headers: cookie ? { cookie } : {},
  });
}

// Login de Nextcloud que, tras iniciar sesión, abre el ajedrez dentro de la app gaming.
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
  it("ya no hay modo sin login: un .env antiguo con NEXT_PUBLIC_ENABLE_LOGIN=false sin cookie redirige al login de Nextcloud", async () => {
    process.env.NEXT_PUBLIC_ENABLE_LOGIN = "false";

    const res = await proxy(makeRequest("http://localhost/pages/games/chess"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGIN_CHESS);
  });

  it("sin cookie, redirige al login de Nextcloud sin llamar a fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await proxy(makeRequest("http://localhost/pages/games/chess"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGIN_CHESS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin NEXTCLOUD_URL no hay a dónde mandar al usuario: error de configuración", async () => {
    delete process.env.NEXTCLOUD_URL;

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(500);
  });

  it("usa NEXTCLOUD_PUBLIC_URL (la que ve el navegador) y conserva la query en el deeplink", async () => {
    process.env.NEXTCLOUD_URL = "http://nextcloud";
    process.env.NEXTCLOUD_PUBLIC_URL = "http://localhost:4480/";

    const res = await proxy(makeRequest("http://localhost/pages/games/tetris?x=1"));

    expect(res.headers.get("location")).toBe(
      "http://localhost:4480/login?redirect_url=%2Findex.php%2Fapps%2Fgaming%2Fpages%2Fgames%2Ftetris%3Fx%3D1"
    );
  });

  it("la portada sin sesión lleva a la raíz de la app gaming", async () => {
    const res = await proxy(makeRequest("http://localhost/"));

    expect(res.headers.get("location")).toBe(
      "https://cloud.example.com/login?redirect_url=%2Findex.php%2Fapps%2Fgaming%2F"
    );
  });

  it("si fetch a Nextcloud falla (red caída), redirige al login de Nextcloud", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGIN_CHESS);
  });

  it("si Nextcloud responde no-ok, redirige al login de Nextcloud", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGIN_CHESS);
  });

  it("si la respuesta de Nextcloud no es JSON válido, redirige al login de Nextcloud", async () => {
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

  it("si el JSON no trae ocs.data.id, redirige al login de Nextcloud", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ocs: { data: {} } })));

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGIN_CHESS);
  });

  it("userId falsy pero no undefined (0) también redirige al login de Nextcloud", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ocs: { data: { id: 0 } } })));

    const res = await proxy(makeRequest("http://localhost/pages/games/chess", "session=abc"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGIN_CHESS);
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
