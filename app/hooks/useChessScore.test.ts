// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChessScore } from "./useChessScore";

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

const GET_SCORES = "GET /bookmarks/api/scores";
const POST_SCORES = "POST /bookmarks/api/scores";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useChessScore", () => {
  it("carga las puntuaciones al montar", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        [GET_SCORES]: () =>
          jsonResponse({
            scores: [{ score: 1800, userId: "u1", username: "u1", createdAt: "2026-01-01" }],
          }),
      })
    );

    const { result } = renderHook(() => useChessScore());

    await waitFor(() => expect(result.current.topScores).toHaveLength(1));
    expect(result.current.topScores[0]).toEqual({ elo: 1800, time: "2026-01-01", userId: "u1" });
    expect(result.current.scoreError).toBeNull();
  });

  it("loadScores expone un error si la petición falla", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        [GET_SCORES]: () => {
          throw new Error("network down");
        },
      })
    );

    const { result } = renderHook(() => useChessScore());

    await waitFor(() => expect(result.current.scoreError).not.toBeNull());
    expect(result.current.topScores).toEqual([]);
  });

  it("saveScore guarda una única vez por partida (guard) hasta resetSaveGuard", async () => {
    const fetchMock = routeFetch({
      [GET_SCORES]: () => jsonResponse({ scores: [] }),
      [POST_SCORES]: () => jsonResponse({ message: "ok", id: 1, score: 1900, rank: 1, total: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useChessScore());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    let first = false;
    let second = false;
    await act(async () => {
      first = await result.current.saveScore("nonce-1");
    });
    await act(async () => {
      second = await result.current.saveScore("nonce-1");
    });

    expect(first).toBe(true);
    expect(second).toBe(false);

    act(() => result.current.resetSaveGuard());

    let third = false;
    await act(async () => {
      third = await result.current.saveScore("nonce-1");
    });
    expect(third).toBe(true);
  });

  it("saveScore adopta el rank/total de ESTA partida (no el mejor histórico) tal cual los devuelve el POST", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        [GET_SCORES]: () => jsonResponse({ scores: [] }),
        [POST_SCORES]: () => jsonResponse({ message: "ok", id: 1, score: 1900, rank: 8, total: 14 }),
      })
    );

    const { result } = renderHook(() => useChessScore());
    expect(result.current.myRank).toBeNull();

    await act(async () => {
      await result.current.saveScore("nonce-1");
    });

    // Aunque el jugador ya tuviera un mejor puesto guardado de antes, lo que
    // se muestra es el resultado de ESTA partida (posición 8 de 14).
    expect(result.current.myRank).toEqual({ rank: 8, total: 14 });
  });

  it("resetSaveGuard limpia myRank", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        [GET_SCORES]: () => jsonResponse({ scores: [] }),
        [POST_SCORES]: () => jsonResponse({ message: "ok", id: 1, score: 1500, rank: 5, total: 9 }),
      })
    );

    const { result } = renderHook(() => useChessScore());
    await act(async () => {
      await result.current.saveScore("nonce-1");
    });
    expect(result.current.myRank).not.toBeNull();

    act(() => result.current.resetSaveGuard());
    expect(result.current.myRank).toBeNull();
  });

  it("saveScore expone el error y libera el guard si el servidor responde con fallo", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        [GET_SCORES]: () => jsonResponse({ scores: [] }),
        [POST_SCORES]: () => jsonResponse({ error: "Invalid nonce" }, false),
      })
    );

    const { result } = renderHook(() => useChessScore());

    let saved = true;
    await act(async () => {
      saved = await result.current.saveScore("bad-nonce");
    });

    expect(saved).toBe(false);
    expect(result.current.scoreError).toMatch(/no se pudo guardar/i);

    // El guard se liberó: un segundo intento vuelve a llamar al servidor
    await act(async () => {
      saved = await result.current.saveScore("bad-nonce");
    });
    expect(saved).toBe(false);
  });
});
