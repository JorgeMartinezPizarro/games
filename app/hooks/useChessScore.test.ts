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
  it("loads the scores on mount", async () => {
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

  it("loadScores exposes an error if the request fails", async () => {
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

  it("saveScore saves only once per game (guard) until resetSaveGuard", async () => {
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

  it("saveScore adopts THIS game's rank/total (not the all-time best) exactly as returned by the POST", async () => {
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

    // Even if the player already had a better saved position from before,
    // what's shown is THIS game's result (position 8 of 14).
    expect(result.current.myRank).toEqual({ rank: 8, total: 14 });
  });

  it("resetSaveGuard clears myRank", async () => {
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

  it("saveScore exposes the error and releases the guard if the server responds with a failure", async () => {
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
    expect(result.current.scoreError).toMatch(/couldn't save/i);

    // The guard was released: a second attempt calls the server again
    await act(async () => {
      saved = await result.current.saveScore("bad-nonce");
    });
    expect(saved).toBe(false);
  });
});
