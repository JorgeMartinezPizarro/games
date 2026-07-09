// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMs, useWordsScore } from "./useWordsScore";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

// Se mantiene la query string completa como parte de la clave: loadScores
// (GET .../scores?gameId=4) y fetchMyRank (GET .../scores?me=true&gameId=4)
// comparten path pero son endpoints distintos.
function routeFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const key = `${init?.method ?? "GET"} ${url}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unhandled fetch call: ${key}`);
    return handler();
  });
}

const GET_SCORES = "GET /bookmarks/api/scores?gameId=4";
const GET_MY_RANK = "GET /bookmarks/api/scores?me=true&gameId=4";
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

  it("saveScore adopta la posición en el ranking completo (rank/total) vía fetchMyRank", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        [GET_SCORES]: () => jsonResponse({ scores: [] }),
        [GET_MY_RANK]: () =>
          jsonResponse({
            username: "me",
            games: [
              {
                gameId: 4,
                gameName: "Wording",
                found: true,
                score: 3000,
                rank: 1,
                total: 25,
                gameConfig: null,
                createdAt: "t",
              },
            ],
          }),
        [POST_SCORES]: () => jsonResponse({ score: 3000 }),
      })
    );

    const { result } = renderHook(() => useWordsScore());

    let saveResult: { score: number; rank: number | null; total: number | null } | null = null;
    await act(async () => {
      saveResult = await result.current.saveScore("nonce-1");
    });

    expect(saveResult).toEqual({ score: 3000, rank: 1, total: 25 });
  });

  it("saveScore deja rank/total en null cuando fetchMyRank no encuentra puntuación", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        [GET_SCORES]: () => jsonResponse({ scores: [] }),
        [GET_MY_RANK]: () => jsonResponse({ username: "me", games: [] }),
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
      [GET_MY_RANK]: () => jsonResponse({ username: "me", games: [] }),
      [POST_SCORES]: () => jsonResponse({ score: 1000 }),
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
