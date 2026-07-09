import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAuth } from "./auth";

// requireAuth siempre se mockea por completo en los tests de las rutas
// (vi.mock("@/app/lib/auth", ...)), así que su propia lógica (bypass de dev,
// caché de 60s por cookie, parseo del payload de Nextcloud, errores) nunca
// se había ejecutado en ningún test.

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
  process.env.NEXT_PUBLIC_ENABLE_LOGIN = "true";
  process.env.NEXTCLOUD_URL = "https://cloud.example.com";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("requireAuth", () => {
  it("en modo dev (NEXT_PUBLIC_ENABLE_LOGIN=false) devuelve el usuario de dev sin llamar a fetch", async () => {
    process.env.NEXT_PUBLIC_ENABLE_LOGIN = "false";
    process.env.NEXT_PUBLIC_DEV_USER = "peter";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const user = await requireAuth(makeRequest());

    expect(user).toEqual({ id: "peter", name: "Dev User", email: "dev@local" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lanza 'No session cookie' si no hay cookie", async () => {
    await expect(requireAuth(makeRequest())).rejects.toThrow("No session cookie");
  });

  it("lanza si falta NEXTCLOUD_URL", async () => {
    delete process.env.NEXTCLOUD_URL;
    await expect(requireAuth(makeRequest("session=abc-missing-url"))).rejects.toThrow(
      "Server misconfigured: missing NEXTCLOUD_URL"
    );
  });

  it("lanza 'Nextcloud unreachable' si fetch falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    await expect(requireAuth(makeRequest("session=abc-unreachable"))).rejects.toThrow(
      "Nextcloud unreachable"
    );
  });

  it("lanza 'Invalid Nextcloud session' si la respuesta no es ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));
    await expect(requireAuth(makeRequest("session=abc-invalid"))).rejects.toThrow(
      "Invalid Nextcloud session"
    );
  });

  it("lanza 'Invalid user profile' si el payload no trae id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ocs: { data: {} } })));
    await expect(requireAuth(makeRequest("session=abc-no-id"))).rejects.toThrow(
      "Invalid user profile"
    );
  });

  it("parsea displayname/email/id con las prioridades correctas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ ocs: { data: { id: 7, displayname: "  Ada  ", email: " ada@x.com " } } })
      )
    );
    const user = await requireAuth(makeRequest("session=abc-full"));
    expect(user).toEqual({ id: "7", name: "Ada", email: "ada@x.com" });
  });

  it("cae a email y luego a id cuando falta displayname", async () => {
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

  it("cachea el usuario 60s por cookie: una segunda llamada dentro de ese margen no vuelve a llamar a fetch", async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(1); // sigue en caché, no hay segunda llamada
  });

  it("expira la caché a los 60s: pasado ese margen, vuelve a llamar a fetch", async () => {
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
