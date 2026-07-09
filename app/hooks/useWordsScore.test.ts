// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMs, useWordsScore } from "./useWordsScore";

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

describe("formatMs", () => {
  it("formatea milisegundos por debajo del minuto", () => {
    expect(formatMs(1234)).toBe("1.234s");
  });

  it("formatea minutos y segundos por encima del minuto", () => {
    expect(formatMs(65_500)).toBe("1m 5.500s");
  });
});

describe("useWordsScore", () => {
  it("carga las puntuaciones al montar", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        [GET_SCORES]: () =>
          jsonResponse({
            scores: [
              {
                score: 5000,
                userId: "u1",
                username: "u1",
                gameConfig: { wordsTotal: 10, correctAnswers: 8 },
                createdAt: "t1",
              },
            ],
          }),
      })
    );

    const { result } = renderHook(() => useWordsScore());

    await waitFor(() => {
      expect(result.current.topScores).toHaveLength(1);
    });

    expect(result.current.topScores[0]).toEqual({
      score: 5000,
      userId: "u1",
      wordsTotal: 10,
      correctAnswers: 8,
      createdAt: "t1",
    });
  });

  it("saveScore adopta el rank/total de ESTA partida (no el mejor histórico) tal cual los devuelve el POST", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        [GET_SCORES]: () => jsonResponse({ scores: [] }),
        [POST_SCORES]: () => jsonResponse({ score: 3000, rank: 25, total: 40 }),
      })
    );

    const { result } = renderHook(() => useWordsScore());

    let saveResult: { score: number; rank: number | null; total: number | null } | null = null;
    await act(async () => {
      saveResult = await result.current.saveScore("nonce-1");
    });

    // Aunque el jugador ya tuviera un mejor puesto guardado de antes, lo que
    // se muestra es el resultado de ESTA ronda (posición 25 de 40).
    expect(saveResult).toEqual({ score: 3000, rank: 25, total: 40 });
  });

  it("saveScore deja rank/total en null cuando el backend no los manda", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        [GET_SCORES]: () => jsonResponse({ scores: [] }),
        [POST_SCORES]: () => jsonResponse({ score: 500 }),
      })
    );

    const { result } = renderHook(() => useWordsScore());

    let saveResult: { score: number; rank: number | null; total: number | null } | null = null;
    await act(async () => {
      saveResult = await result.current.saveScore("nonce-1");
    });

    expect(saveResult).toEqual({ score: 500, rank: null, total: null });
  });

  it("saveScore no vuelve a guardar hasta que se llama a resetSaveGuard", async () => {
    const fetchMock = routeFetch({
      [GET_SCORES]: () => jsonResponse({ scores: [] }),
      [POST_SCORES]: () => jsonResponse({ score: 1000, rank: 1, total: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useWordsScore());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    let first: unknown;
    let second: unknown;
    await act(async () => {
      first = await result.current.saveScore("nonce-1");
    });
    await act(async () => {
      second = await result.current.saveScore("nonce-1");
    });

    expect(first).not.toBeNull();
    expect(second).toBeNull();

    act(() => result.current.resetSaveGuard());

    let third: unknown;
    await act(async () => {
      third = await result.current.saveScore("nonce-1");
    });
    expect(third).not.toBeNull();
  });

  it("saveScore devuelve null y permite reintentar si la respuesta no es ok", async () => {
    let postCalls = 0;
    vi.stubGlobal(
      "fetch",
      routeFetch({
        [GET_SCORES]: () => jsonResponse({ scores: [] }),
        [POST_SCORES]: () => {
          postCalls += 1;
          return jsonResponse({ error: "nope" }, false);
        },
      })
    );

    const { result } = renderHook(() => useWordsScore());

    let saveResult: unknown;
    await act(async () => {
      saveResult = await result.current.saveScore("nonce-1");
    });

    expect(saveResult).toBeNull();
    expect(postCalls).toBe(1);

    // Al fallar, el guard se libera solo (sin necesidad de resetSaveGuard)
    await act(async () => {
      saveResult = await result.current.saveScore("nonce-1");
    });
    expect(postCalls).toBe(2);
  });
});
