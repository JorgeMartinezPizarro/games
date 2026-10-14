// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CellValues } from "@/app/types";
import { useNumbers } from "./useNumbers";

function cell(i: number, n: number, b = false): CellValues {
  return { values: { n, b, i } };
}

// 20-cell "ring" board with jump 1: each cell i can only be reached from
// i-1 or i+1 (mod 20). Simple and deterministic for completing a whole
// tour. The hook uses 20 as a fixed modulus (the real BOARD_SIZE), so any
// test board must have exactly 20 cells.
function ringBoard(): CellValues[] {
  return Array.from({ length: 20 }, (_, i) => cell(i, 1));
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

async function startNewGame(
  result: { current: ReturnType<typeof useNumbers> },
  board: CellValues[]
) {
  vi.stubGlobal(
    "fetch",
    routeFetch({
      "POST /bookmarks/api/numbers/new-game": () =>
        jsonResponse({ nonce: "nonce-1", timestamp: 1, board }),
    })
  );
  await act(async () => {
    await result.current.newGame();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(150);
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

describe("useNumbers", () => {
  it("starts with no board and not loading", () => {
    const { result } = renderHook(() => useNumbers());
    expect(result.current.numbers).toEqual([]);
    expect(result.current.steps).toBe(0);
    expect(result.current.isRight).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("newGame loads the board from the server and calls onReset", async () => {
    const board = ringBoard();
    const onReset = vi.fn();
    const { result } = renderHook(() => useNumbers({ onReset }));

    await startNewGame(result, board);

    expect(result.current.numbers).toEqual(board);
    expect(result.current.steps).toBe(0);
    expect(result.current.isRight).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("a valid click marks the cell, adds a step and updates the live score", async () => {
    const board = ringBoard();
    const { result } = renderHook(() => useNumbers());
    await startNewGame(result, board);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      result.current.handleClick(board[0]);
    });

    expect(result.current.steps).toBe(1);
    // elapsedMs = 150 (startNewGame) + 1000 (test's advance) = 1150.
    // pace = max(1150/1, 150) = 1150; score = round(1^2 * 1000 / 1150) = 1
    expect(result.current.currentScore).toBe(1);
  });

  it("a click without a valid jump relation ends the game without counting the step", async () => {
    const board = ringBoard();
    board[0] = cell(0, 4); // from 0 with jump 4, the only valid destinations are 4 and 16
    const onFinish = vi.fn();
    const { result } = renderHook(() => useNumbers({ onFinish }));
    await startNewGame(result, board);

    act(() => result.current.handleClick(board[0])); // first click: always valid
    expect(result.current.steps).toBe(1);

    act(() => result.current.handleClick(board[10])); // 10 is neither 4 nor 16: illegal

    expect(result.current.isRight).toBe(false);
    expect(result.current.steps).toBe(1); // the illegal click doesn't count
    expect(onFinish).toHaveBeenCalledTimes(1);
    const [, finalSteps, moves] = onFinish.mock.calls[0];
    expect(finalSteps).toBe(1);
    // t=150: no clock advance between startNewGame and the click.
    expect(moves).toEqual([{ i: 0, t: 150 }]);
  });

  it("running out of possible moves (blocked) ends the game", async () => {
    // A(0,n=4) -> B(4,n=2) -> C(2,n=2): when C is marked, both of its
    // neighbours by its own jump (2±2 mod 20 = {0,4}) are already visited (A and B).
    const board = ringBoard();
    board[0] = cell(0, 4);
    board[4] = cell(4, 2);
    board[2] = cell(2, 2);
    const onFinish = vi.fn();
    const { result } = renderHook(() => useNumbers({ onFinish }));
    await startNewGame(result, board);

    act(() => result.current.handleClick(board[0]));
    act(() => result.current.handleClick(board[4]));
    act(() => result.current.handleClick(board[2]));

    expect(result.current.steps).toBe(3);
    expect(result.current.isRight).toBe(false);
    expect(onFinish).toHaveBeenCalledTimes(1);
    const [, finalSteps, moves] = onFinish.mock.calls[0];
    expect(finalSteps).toBe(3);
    // No clock advances between clicks: all 3 land on the same t=150.
    expect(moves).toEqual([
      { i: 0, t: 150 },
      { i: 4, t: 150 },
      { i: 2, t: 150 },
    ]);
    // The same trail is exposed for rendering the order of the cells.
    expect(result.current.moves.map((m) => m.i)).toEqual([0, 4, 2]);
  });

  it("completing all 20 cells ends the game (won) and calls onFinish", async () => {
    const board = ringBoard();
    const onFinish = vi.fn();
    const { result } = renderHook(() => useNumbers({ onFinish }));
    await startNewGame(result, board);

    for (let i = 0; i < 20; i++) {
      act(() => result.current.handleClick(board[i]));
    }

    expect(result.current.steps).toBe(20);
    expect(result.current.isRight).toBe(true); // completing isn't "losing"
    expect(onFinish).toHaveBeenCalledTimes(1);
    const [, finalSteps, moves, nonce] = onFinish.mock.calls[0];
    expect(finalSteps).toBe(20);
    expect(moves).toEqual(Array.from({ length: 20 }, (_, i) => ({ i, t: 150 })));
    expect(nonce).toBe("nonce-1");
  });

  it("adopts the confirmed score returned by onFinish", async () => {
    const board = ringBoard();
    const onFinish = vi.fn().mockResolvedValue(999);
    const { result } = renderHook(() => useNumbers({ onFinish }));
    await startNewGame(result, board);

    act(() => vi.advanceTimersByTime(1000));
    await act(async () => {
      result.current.handleClick(board[0]);
      result.current.handleClick(board[19]); // valid neighbour (jump 1) -> blocks or continues
    });
    // Force the game to end with an invalid click to leave currentScore
    // up to onFinish.
    await act(async () => {
      result.current.handleClick(cell(15, 1)); // jump doesn't match from the last valid one
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onFinish).toHaveBeenCalled();
    expect(result.current.currentScore).toBe(999);
  });
});
