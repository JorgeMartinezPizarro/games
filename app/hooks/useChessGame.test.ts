// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { useChessGame } from "./useChessGame";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

// Each key maps to a queue of responses: if it has more than one, they are
// consumed in order (one per call); if only one is left, it is reused for any
// unexpected extra calls.
function routeFetch(handlers: Record<string, Array<() => Response | Promise<Response>>>) {
  const queues = new Map(Object.entries(handlers).map(([k, v]) => [k, [...v]]));
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const key = `${init?.method ?? "GET"} ${url.split("?")[0]}`;
    const queue = queues.get(key);
    if (!queue || queue.length === 0) throw new Error(`Unhandled fetch call: ${key}`);
    const handler = queue.length > 1 ? queue.shift()! : queue[0];
    return handler();
  });
}

async function playAndSettle(
  onDrop: (from: string, to: string) => boolean,
  from: string,
  to: string
) {
  act(() => {
    onDrop(from, to);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useChessGame", () => {
  it("initializes the board with the starting position", () => {
    const { result } = renderHook(() => useChessGame());
    expect(result.current.fen).toBe(new Chess().fen());
    expect(result.current.gameStarted).toBe(false);
    expect(result.current.isGameOver).toBe(false);
  });

  it("handleEloChange only changes the elo if the game hasn't started", () => {
    const { result } = renderHook(() => useChessGame());

    act(() => result.current.handleEloChange({} as Event, 1200));
    expect(result.current.elo).toBe(1200);
  });

  it("handleEloChange ignores changes once the game has started", () => {
    vi.stubGlobal("fetch", routeFetch({}));
    const { result } = renderHook(() => useChessGame());

    act(() => {
      result.current.onDrop("e2", "e4");
    });
    expect(result.current.gameStarted).toBe(true);

    act(() => result.current.handleEloChange({} as Event, 2000));
    expect(result.current.elo).toBe(400);
  });

  it("onSquareClick selects an own piece and highlights its legal destinations", () => {
    const { result } = renderHook(() => useChessGame());

    act(() => {
      result.current.onSquareClick("e2" as Square);
    });

    expect(result.current.optionSquares).toHaveProperty("e3");
    expect(result.current.optionSquares).toHaveProperty("e4");
  });

  it("onSquareClick on the same square deselects", () => {
    const { result } = renderHook(() => useChessGame());

    act(() => result.current.onSquareClick("e2" as Square));
    expect(Object.keys(result.current.optionSquares).length).toBeGreaterThan(0);

    act(() => result.current.onSquareClick("e2" as Square));
    expect(result.current.optionSquares).toEqual({});
  });

  it("onDrop rejects an illegal move without calling the server", () => {
    const fetchMock = routeFetch({});
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChessGame());

    let moved = true;
    act(() => {
      moved = result.current.onDrop("e2", "e5"); // 3 squares: illegal
    });

    expect(moved).toBe(false);
    expect(result.current.gameStarted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("onDrop applies the local move and, after the pause, the server's", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/chess/new-game": [() => jsonResponse({ nonce: "n1", timestamp: 1 })],
        "POST /bookmarks/api/chess": [() => jsonResponse({ bestmove: "e7e5", gameOver: false })],
      })
    );
    const { result } = renderHook(() => useChessGame());

    let moved = false;
    act(() => {
      moved = result.current.onDrop("e2", "e4");
    });
    expect(moved).toBe(true);
    expect(result.current.gameStarted).toBe(true);
    expect(result.current.isAIThinking).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.isAIThinking).toBe(false);
    const expected = new Chess();
    expected.move({ from: "e2", to: "e4" });
    expected.move({ from: "e7", to: "e5" });
    expect(result.current.fen).toBe(expected.fen());
  });

  it("if the server doesn't validate the move, resets the game and exposes the error", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/chess/new-game": [() => jsonResponse({ nonce: "n1", timestamp: 1 })],
        "POST /bookmarks/api/chess": [() => jsonResponse({ error: "nonce expired" }, false)],
      })
    );
    const { result } = renderHook(() => useChessGame());

    await playAndSettle(result.current.onDrop, "e2", "e4");

    expect(result.current.fen).toBe("start");
    expect(result.current.gameStarted).toBe(false);
    expect(result.current.gameError).toMatch(/out of sync/);
  });

  it("resetGame clears the state and calls onReset", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/chess/new-game": [() => jsonResponse({ nonce: "n1", timestamp: 1 })],
        "POST /bookmarks/api/chess": [() => jsonResponse({ bestmove: "e7e5", gameOver: false })],
      })
    );
    const onReset = vi.fn();
    const { result } = renderHook(() => useChessGame({ onReset }));

    await playAndSettle(result.current.onDrop, "e2", "e4");
    expect(result.current.gameStarted).toBe(true);

    act(() => result.current.resetGame());

    expect(result.current.fen).toBe("start");
    expect(result.current.gameStarted).toBe(false);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("when the player delivers checkmate, calls onPlayerWin with the game's nonce", async () => {
    // Scholar's Mate: 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#
    const onPlayerWin = vi.fn();
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/chess/new-game": [() => jsonResponse({ nonce: "n1", timestamp: 1 })],
        "POST /bookmarks/api/chess": [
          () => jsonResponse({ bestmove: "e7e5", gameOver: false }),
          () => jsonResponse({ bestmove: "b8c6", gameOver: false }),
          () => jsonResponse({ bestmove: "g8f6", gameOver: false }),
          () => jsonResponse({ bestmove: null, gameOver: true }),
        ],
      })
    );

    const { result } = renderHook(() => useChessGame({ onPlayerWin }));

    await playAndSettle(result.current.onDrop, "e2", "e4");
    await playAndSettle(result.current.onDrop, "d1", "h5");
    await playAndSettle(result.current.onDrop, "f1", "c4");
    await playAndSettle(result.current.onDrop, "h5", "f7");

    expect(onPlayerWin).toHaveBeenCalledTimes(1);
    expect(onPlayerWin).toHaveBeenCalledWith("n1");
    expect(result.current.isGameOver).toBe(true);
    expect(result.current.gameResult).toBe("Player wins (checkmate)");
  });

  it("exposes the SAN history, the last move and the king in check for rendering", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/chess/new-game": [() => jsonResponse({ nonce: "n1", timestamp: 1 })],
        "POST /bookmarks/api/chess": [
          () => jsonResponse({ bestmove: "e7e5", gameOver: false }),
          () => jsonResponse({ bestmove: "b8c6", gameOver: false }),
          () => jsonResponse({ bestmove: "g8f6", gameOver: false }),
          () => jsonResponse({ bestmove: null, gameOver: true }),
        ],
      })
    );

    const { result } = renderHook(() => useChessGame());
    expect(result.current.history).toEqual([]);
    expect(result.current.lastMove).toBeNull();
    expect(result.current.checkSquare).toBeNull();

    await playAndSettle(result.current.onDrop, "e2", "e4");
    // The AI's reply also counts as the last move.
    expect(result.current.history).toEqual(["e4", "e5"]);
    expect(result.current.lastMove).toEqual({ from: "e7", to: "e5" });

    await playAndSettle(result.current.onDrop, "d1", "h5");
    await playAndSettle(result.current.onDrop, "f1", "c4");
    await playAndSettle(result.current.onDrop, "h5", "f7");

    expect(result.current.history).toEqual(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"]);
    expect(result.current.lastMove).toEqual({ from: "h5", to: "f7" });
    expect(result.current.checkSquare).toBe("e8");

    act(() => result.current.resetGame());
    expect(result.current.history).toEqual([]);
    expect(result.current.lastMove).toBeNull();
    expect(result.current.checkSquare).toBeNull();
  });
});
