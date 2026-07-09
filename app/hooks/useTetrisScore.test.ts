// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LINES_TARGET } from "./useTetris";
import { formatTimeMs, useScore } from "./useTetrisScore";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

function routeFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const key = `${init?.method ?? "GET"} ${url.split("?")[0]}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unhandled fetch call: ${key}`);
    return handler();
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("formatTimeMs", () => {
  it("formatea por debajo del minuto como segundos", () => {
    expect(formatTimeMs(45_230)).toBe("45.230s");
  });

  it("formatea por encima del minuto como minutos:segundos", () => {
    expect(formatTimeMs(125_678)).toBe("2:05.678");
  });
});

describe("useScore (tetris)", () => {
  it("loadScores mapea el formato nuevo (gameConfig.linesTarget presente)", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "GET /bookmarks/api/scores": () =>
          jsonResponse({
            scores: [
              { score: 45230, userId: "u1", username: "u1", gameConfig: { linesTarget: 25 }, createdAt: "t" },
            ],
          }),
      })
    );

    const { result } = renderHook(() => useScore());

    await waitFor(() => expect(result.current.topScores).toHaveLength(1));
    expect(result.current.topScores[0]).toEqual({ userId: "u1", timeMs: 45230, linesTarget: 25 });
  });

  it("loadScores mapea el formato nuevo por heurística (score >= 1000, sin gameConfig)", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "GET /bookmarks/api/scores": () =>
          jsonResponse({
            scores: [{ score: 52000, userId: "u2", username: "u2", gameConfig: null, createdAt: "t" }],
          }),
      })
    );

    const { result } = renderHook(() => useScore());

    await waitFor(() => expect(result.current.topScores).toHaveLength(1));
    expect(result.current.topScores[0]).toEqual({
      userId: "u2",
      timeMs: 52000,
      linesTarget: LINES_TARGET,
    });
  });

  it("loadScores mapea el formato legacy (score = linesTarget, gameConfig.timer en segundos)", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "GET /bookmarks/api/scores": () =>
          jsonResponse({
            scores: [{ score: 20, userId: "u3", username: "u3", gameConfig: { timer: 37 }, createdAt: "t" }],
          }),
      })
    );

    const { result } = renderHook(() => useScore());

    await waitFor(() => expect(result.current.topScores).toHaveLength(1));
    expect(result.current.topScores[0]).toEqual({ userId: "u3", timeMs: 37_000, linesTarget: 20 });
  });

  it("saveScore manda el nonce y el log de acciones, y solo guarda una vez hasta resetSaveGuard", async () => {
    const fetchMock = routeFetch({
      "GET /bookmarks/api/scores": () => jsonResponse({ scores: [] }),
      "POST /bookmarks/api/scores": () =>
        jsonResponse({ message: "ok", id: 1, score: 45230, rank: 2, total: 8 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useScore());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const actions = [{ type: "resume", t: 0 } as const];
    let first: number | null = null;
    let second: number | null = null;
    await act(async () => {
      first = await result.current.saveScore("nonce-1", actions as any);
    });
    await act(async () => {
      second = await result.current.saveScore("nonce-1", actions as any);
    });

    expect(first).toBe(45230);
    expect(second).toBeNull();

    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "POST");
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toEqual({ gameId: 3, nonce: "nonce-1", actions });

    act(() => result.current.resetSaveGuard());
    let third: number | null = null;
    await act(async () => {
      third = await result.current.saveScore("nonce-1", actions as any);
    });
    expect(third).toBe(45230);
  });

  it("saveScore adopta el rank/total del resultado de ESTA partida (no el mejor histórico) tal cual los devuelve el POST", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "GET /bookmarks/api/scores": () => jsonResponse({ scores: [] }),
        "POST /bookmarks/api/scores": () =>
          jsonResponse({ message: "ok", id: 1, score: 20_000, rank: 25, total: 40 }),
      })
    );

    const { result } = renderHook(() => useScore());
    expect(result.current.lastResult).toBeNull();

    await act(async () => {
      await result.current.saveScore("nonce-1", [{ type: "resume", t: 0 } as const] as any);
    });

    // Aunque el jugador ya tuviera un mejor puesto guardado de antes, lo que
    // se muestra es el resultado de ESTA ronda (posición 25 de 40).
    expect(result.current.lastResult).toEqual({ timeMs: 20_000, rank: 25, total: 40 });
  });

  it("resetSaveGuard limpia lastResult", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "GET /bookmarks/api/scores": () => jsonResponse({ scores: [] }),
        "POST /bookmarks/api/scores": () =>
          jsonResponse({ message: "ok", id: 1, score: 5_000, rank: 3, total: 5 }),
      })
    );

    const { result } = renderHook(() => useScore());
    await waitFor(() => expect(result.current.topScores).toEqual([]));

    await act(async () => {
      await result.current.saveScore("nonce-1", [{ type: "resume", t: 0 } as const] as any);
    });
    expect(result.current.lastResult).not.toBeNull();

    act(() => result.current.resetSaveGuard());
    expect(result.current.lastResult).toBeNull();
  });

  it("saveScore devuelve null y libera el guard si el servidor responde con error", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "GET /bookmarks/api/scores": () => jsonResponse({ scores: [] }),
        "POST /bookmarks/api/scores": () => jsonResponse({ error: "Invalid game" }, false),
      })
    );

    const { result } = renderHook(() => useScore());

    let saved: number | null = 0 as any;
    await act(async () => {
      saved = await result.current.saveScore("nonce-1", []);
    });
    expect(saved).toBeNull();

    await act(async () => {
      saved = await result.current.saveScore("nonce-1", []);
    });
    // Al no haber tenido éxito, el guard se liberó y se reintenta (segunda llamada también resuelve, no null por el guard)
    expect(saved).toBeNull();
  });
});
