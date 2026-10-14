// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CellValues } from "@/app/types";
import type { NumbersMove } from "@/app/lib/numbers/board";
import { useScoreNumbers } from "./useScoreNumbers";

// saveScore expects NumbersMove[] ({i, t}), not bare indices: the increasing
// timestamps are arbitrary, they only need to be valid in shape (the real
// server validates them; here they are only serialized).
function moves(...indices: number[]): NumbersMove[] {
  return indices.map((i, idx) => ({ i, t: idx * 100 }));
}

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

const board: CellValues[] = [{ values: { n: 1, b: false, i: 0 } }];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useScoreNumbers", () => {
  it("loadScores maps score/steps/userId/time", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        [GET_SCORES]: () =>
          jsonResponse({
            scores: [
              { score: 1200, userId: "u1", username: "u1", gameConfig: { steps: 18 }, createdAt: "t1" },
              { score: 900, username: "u2", gameConfig: null, createdAt: "t2" },
            ],
          }),
      })
    );

    const { result } = renderHook(() => useScoreNumbers());

    await act(async () => {
      await result.current.loadScores();
    });

    expect(result.current.topScores).toEqual([
      { score: 1200, steps: 18, userId: "u1", time: "t1" },
      { score: 900, steps: 0, userId: "u2", time: "t2" },
    ]);
    expect(result.current.error).toBeUndefined();
  });

  it("loadScores exposes the error message if the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    const { result } = renderHook(() => useScoreNumbers());
    await act(async () => {
      await result.current.loadScores();
    });

    expect(result.current.error).toBe("network down");
  });

  it("saveScore doesn't call the server if there's no nonce", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useScoreNumbers());

    let saved: number | null = 0;
    await act(async () => {
      saved = await result.current.saveScore(10, 5, moves(0, 1), null, board);
    });

    expect(saved).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saveScore sends the nonce/board/moves and adopts the score confirmed by the server", async () => {
    const fetchMock = routeFetch({
      [GET_SCORES]: () => jsonResponse({ scores: [] }),
      [POST_SCORES]: () => jsonResponse({ message: "ok", id: 1, score: 555, rank: 3, total: 9 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useScoreNumbers());

    let saved: number | null = null;
    await act(async () => {
      saved = await result.current.saveScore(10, 5, moves(0, 1, 2), "nonce-1", board);
    });

    expect(saved).toBe(555);
    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "POST");
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toEqual({ gameId: 2, nonce: "nonce-1", board, moves: moves(0, 1, 2) });
  });

  it("saveScore only saves once until resetScore", async () => {
    const fetchMock = routeFetch({
      [GET_SCORES]: () => jsonResponse({ scores: [] }),
      [POST_SCORES]: () => jsonResponse({ score: 100, rank: 1, total: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useScoreNumbers());

    let first: number | null = null;
    let second: number | null = null;
    await act(async () => {
      first = await result.current.saveScore(1, 1, moves(0), "n1", board);
    });
    await act(async () => {
      second = await result.current.saveScore(1, 1, moves(0), "n1", board);
    });

    expect(first).toBe(100);
    expect(second).toBeNull();

    act(() => result.current.resetScore());

    let third: number | null = null;
    await act(async () => {
      third = await result.current.saveScore(1, 1, moves(0), "n1", board);
    });
    expect(third).toBe(100);
  });

  it("sets recordEntry only when the confirmed score beats the previous best", async () => {
    const fetchMock = routeFetch({
      [GET_SCORES]: () =>
        jsonResponse({ scores: [{ score: 500, userId: "u1", gameConfig: {}, createdAt: "t" }] }),
      [POST_SCORES]: () => jsonResponse({ score: 300, rank: 2, total: 2 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useScoreNumbers());
    await act(async () => {
      await result.current.loadScores();
    });
    await waitFor(() => expect(result.current.topScores).toHaveLength(1));

    await act(async () => {
      await result.current.saveScore(1, 7, moves(0), "n1", board);
    });

    // 300 doesn't beat the previous best (500): no record
    expect(result.current.recordEntry).toBeNull();
  });

  it("saveScore adopts THIS game's rank/total (not the all-time best) exactly as returned by the POST", async () => {
    const fetchMock = routeFetch({
      [GET_SCORES]: () => jsonResponse({ scores: [] }),
      [POST_SCORES]: () => jsonResponse({ score: 555, rank: 25, total: 37 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useScoreNumbers());

    expect(result.current.myRank).toBeNull();

    await act(async () => {
      await result.current.saveScore(10, 5, moves(0, 1, 2), "nonce-1", board);
    });

    // Even if the player already had a better saved position from before,
    // what's shown is THIS round's result (position 25 of 37).
    expect(result.current.myRank).toEqual({ rank: 25, total: 37 });
  });

  it("saveScore returns null if the server responds with a failure, without blocking retries", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        [POST_SCORES]: () => jsonResponse({ error: "bad" }, false),
      })
    );
    const { result } = renderHook(() => useScoreNumbers());

    let saved: number | null = 0;
    await act(async () => {
      saved = await result.current.saveScore(1, 1, moves(0), "n1", board);
    });
    expect(saved).toBeNull();

    // The guard never got set (there was no success), so it can retry without resetScore
    let secondAttempted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        secondAttempted = true;
        return Promise.resolve(jsonResponse({ score: 1 }));
      })
    );
    await act(async () => {
      saved = await result.current.saveScore(1, 1, moves(0), "n1", board);
    });
    expect(secondAttempted).toBe(true);
  });

  it("resetScore clears recordEntry and myRank", async () => {
    const fetchMock = routeFetch({
      [GET_SCORES]: () => jsonResponse({ scores: [] }),
      [POST_SCORES]: () => jsonResponse({ score: 42, rank: 9, total: 12 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useScoreNumbers());

    await act(async () => {
      await result.current.saveScore(1, 3, moves(0), "n1", board);
    });
    expect(result.current.recordEntry).toEqual({ score: 42, steps: 3 });
    expect(result.current.myRank).toEqual({ rank: 9, total: 12 });

    act(() => result.current.resetScore());
    expect(result.current.recordEntry).toBeNull();
    expect(result.current.myRank).toBeNull();
  });
});
