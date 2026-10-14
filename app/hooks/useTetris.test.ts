// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// LINES_TARGET set to 2 in this file only: it lets us complete a real game
// (2 lines cleared with 5 O pieces) without having to actually solve Tetris
// to reach the real 25 lines. The rest of the engine (collisions, rotation,
// line clearing...) is left untouched.
vi.mock("@/app/lib/tetris/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/tetris/engine")>();
  return { ...actual, LINES_TARGET: 2 };
});

import { hardDropDistance, useTetris } from "./useTetris";
import { findSeedWithConsecutiveOPieces, O_PIECE_TARGET_COLUMNS } from "@/app/lib/tetris/testFixtures";
import { LINES_TARGET, TETROMINOS } from "@/app/lib/tetris/engine";

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

async function startAndWaitReady(result: { current: ReturnType<typeof useTetris> }) {
  act(() => {
    result.current.startGame();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

// Drops the current piece just until it locks, using the same pure
// function (hardDropDistance) the engine exposes: it doesn't rely on
// guessing how many rows are free.
async function dropCurrentPiece(result: { current: ReturnType<typeof useTetris> }) {
  const { board, piece, pos } = result.current;
  const distance = hardDropDistance(board, piece, pos);
  await act(async () => {
    for (let i = 0; i <= distance; i++) {
      result.current.softDrop();
    }
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

describe("useTetris", () => {
  it("starts with an empty board and no game in progress", () => {
    const { result } = renderHook(() => useTetris());

    expect(result.current.ready).toBe(false);
    expect(result.current.gameOver).toBe(false);
    expect(result.current.gameCompleted).toBe(false);
    expect(result.current.linesTarget).toBe(LINES_TARGET);
    expect(result.current.board.every((row) => row.every((cell) => cell[1] === "clear"))).toBe(
      true
    );
  });

  it("startGame requests a nonce/seed from the server and places the piece determined by the seed", async () => {
    const seed = 12345;
    const fetchMock = routeFetch({
      "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTetris());
    await startAndWaitReady(result);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.ready).toBe(true);
    expect(result.current.loading).toBe(false);
    // The first piece must be the one the same PRNG generates with that seed.
    const expectedFirstPiece = TETROMINOS.some((p) => p === result.current.piece);
    expect(expectedFirstPiece).toBe(true);
  });

  it("moveLeft/moveRight respect the board boundaries", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed: 1 }),
      })
    );
    const { result } = renderHook(() => useTetris());
    await startAndWaitReady(result);

    const startX = result.current.pos.x;
    act(() => result.current.moveRight());
    expect(result.current.pos.x).toBe(startX + 1);
    act(() => result.current.moveLeft());
    expect(result.current.pos.x).toBe(startX);

    // Push against the left edge until it collides, and check that one
    // extra moveLeft no longer moves the piece (the collision blocks it).
    for (let i = 0; i < 10; i++) act(() => result.current.moveLeft());
    const leftEdgeX = result.current.pos.x;
    act(() => result.current.moveLeft());
    expect(result.current.pos.x).toBe(leftEdgeX);
  });

  it("rotateLeft/rotateRight change the active piece's shape", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed: 7 }),
      })
    );
    const { result } = renderHook(() => useTetris());
    await startAndWaitReady(result);

    const originalShape = result.current.piece.shape;
    act(() => result.current.rotateRight());
    expect(result.current.piece.shape).not.toBe(originalShape);
  });

  it("softDrop moves the piece down and locks it when it reaches the bottom", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed: 42 }),
      })
    );
    const { result } = renderHook(() => useTetris());
    await startAndWaitReady(result);

    const firstPiece = result.current.piece;
    await dropCurrentPiece(result);

    // The piece locked: a new piece appears at the spawn position.
    expect(result.current.pos.y).toBe(0);
    expect(result.current.piece).not.toBe(firstPiece);
    expect(result.current.board.some((row) => row.some((cell) => cell[1] === "filled"))).toBe(
      true
    );
    expect(result.current.gameOver).toBe(false);
  });

  it("stopGame returns to the idle state", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed: 3 }),
      })
    );
    const { result } = renderHook(() => useTetris());
    await startAndWaitReady(result);
    expect(result.current.ready).toBe(true);

    act(() => result.current.stopGame());

    expect(result.current.ready).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.board.every((row) => row.every((cell) => cell[1] === "clear"))).toBe(
      true
    );
  });

  it("startRepeat repeats the action while held down, stopRepeat stops it", () => {
    const { result } = renderHook(() => useTetris());
    const action = vi.fn();

    act(() => result.current.startRepeat("left", action));
    expect(action).toHaveBeenCalledTimes(1); // immediate trigger

    act(() => {
      vi.advanceTimersByTime(300); // HOLD_INITIAL_DELAY: arms the interval, doesn't call yet
    });
    expect(action).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(100 * 4); // HOLD_REPEAT_RATE x4: first repetitions
    });
    expect(action.mock.calls.length).toBeGreaterThanOrEqual(5);

    const callsWhenStopped = action.mock.calls.length;
    act(() => result.current.stopRepeat("left"));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(action.mock.calls.length).toBe(callsWhenStopped);
  });

  it("responds to keyboard keys (ArrowLeft moves the piece)", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed: 5 }),
      })
    );
    const { result } = renderHook(() => useTetris());
    await startAndWaitReady(result);

    const startX = result.current.pos.x;
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    });
    expect(result.current.pos.x).toBe(startX - 1);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft" }));
    });
  });

  it("on reaching linesTarget calls onComplete with the nonce and the log, and adopts the confirmed time", async () => {
    const seed = findSeedWithConsecutiveOPieces(5);
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "POST /bookmarks/api/tetris/new-game": () => jsonResponse({ nonce: "n1", timestamp: 1, seed }),
      })
    );
    const onComplete = vi.fn().mockResolvedValue(42_000);

    const { result } = renderHook(() => useTetris({ onComplete }));
    await startAndWaitReady(result);

    const spawnX = result.current.pos.x;
    for (const col of O_PIECE_TARGET_COLUMNS) {
      const dx = col - spawnX;
      const moveFn = dx < 0 ? result.current.moveLeft : result.current.moveRight;
      for (let i = 0; i < Math.abs(dx); i++) {
        act(() => moveFn());
      }
      await dropCurrentPiece(result);
    }

    // The piece that reaches the target triggers an 80ms flash before the
    // game is marked as completed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.gameCompleted).toBe(true);
    expect(result.current.lines).toBe(2);
    expect(onComplete).toHaveBeenCalledTimes(1);

    const [nonceArg, actionsArg] = onComplete.mock.calls[0];
    expect(nonceArg).toBe("n1");
    expect(actionsArg[0]).toEqual({ type: "resume", t: 0 });
    expect(actionsArg[actionsArg.length - 1].type).toBe("end");

    // The time confirmed by the server is adopted.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.elapsedMs).toBe(42_000);
  });
});
