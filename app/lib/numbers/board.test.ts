import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boardsMatch,
  computeNumbersScore,
  generateBoard,
  hasSolution,
  validateMoves,
} from "./board";
import type { CellValues } from "@/app/types";

function cell(n: number, i: number): CellValues {
  return { values: { n, b: false, i } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateMoves — limits", () => {
  // 4-cell board with jump=1 everywhere: any immediate neighbour is a legal
  // move, so the whole board can be traversed (4 moves).
  const board = [cell(1, 0), cell(1, 1), cell(1, 2), cell(1, 3)];

  it("accepts exactly board.length moves (full traversal)", () => {
    const moves = [
      { i: 0, t: 0 },
      { i: 1, t: 10 },
      { i: 2, t: 20 },
      { i: 3, t: 30 },
    ];
    const result = validateMoves(board, moves, 1000);
    expect(result).toEqual({ valid: true, steps: 4 });
  });

  it("rejects board.length + 1 moves as 'Too many moves'", () => {
    const moves = [
      { i: 0, t: 0 },
      { i: 1, t: 10 },
      { i: 2, t: 20 },
      { i: 3, t: 30 },
      { i: 0, t: 40 }, // repeated, but already too many by length before the contents are checked
    ];
    const result = validateMoves(board, moves, 1000);
    expect(result).toEqual({ valid: false, reason: "Too many moves." });
  });

  it("single-cell board: jump=0, the only possible move is to stay on it", () => {
    const single = [cell(0, 0)];
    const result = validateMoves(single, [{ i: 0, t: 0 }], 1000);
    expect(result).toEqual({ valid: true, steps: 1 });
  });

  it("rejects a non-integer cell index (coercion of a non-numeric string)", () => {
    const result = validateMoves(board, [{ i: "abc", t: 0 }], 1000);
    expect(result).toEqual({ valid: false, reason: "Malformed move." });
  });

  it("rejects an out-of-range index", () => {
    const result = validateMoves(board, [{ i: 4, t: 0 }], 1000);
    expect(result).toEqual({ valid: false, reason: "Invalid cell index." });
  });

  it("rejects a timestamp beyond elapsedMs + clock tolerance", () => {
    const result = validateMoves(board, [{ i: 0, t: 5000 }], 1000);
    expect(result).toEqual({ valid: false, reason: "Move timestamp out of range." });
  });

  it("accepts a timestamp exactly at the tolerance limit (elapsedMs + 2000ms)", () => {
    const result = validateMoves(board, [{ i: 0, t: 3000 }], 1000);
    expect(result).toEqual({ valid: true, steps: 1 });
  });
});

describe("computeNumbersScore — edge cases", () => {
  it("steps=0 returns 0 (no game)", () => {
    expect(computeNumbersScore(0, 5000)).toBe(0);
  });

  it("elapsedMs=0 or negative returns 0", () => {
    expect(computeNumbersScore(5, 0)).toBe(0);
    expect(computeNumbersScore(5, -100)).toBe(0);
  });

  it("a pace below the floor (MIN_MS_PER_STEP) does not raise the score: solving it faster adds nothing", () => {
    const atFloor = computeNumbersScore(10, 1500); // exactly 150ms/step
    const fasterThanFloor = computeNumbersScore(10, 100); // 10ms/step, below the floor
    expect(fasterThanFloor).toBe(atFloor);
  });
});

describe("boardsMatch", () => {
  const board = [cell(2, 0), cell(3, 1)];

  it("compares only the n field of each cell, not b/i", () => {
    expect(boardsMatch(board, [{ values: { n: 2 } }, { values: { n: 3 } }])).toBe(true);
  });

  it("rejects different lengths or non-array payloads", () => {
    expect(boardsMatch(board, [{ values: { n: 2 } }])).toBe(false);
    expect(boardsMatch(board, "not-an-array")).toBe(false);
  });
});

describe("generateBoard — fallback after 200 attempts without a solution", () => {
  // With length=2, an EVEN jump (2, 4 or 6) in both cells means
  // (pos±jump) % 2 == pos always: there's no way to visit the other cell,
  // so hasSolution is false no matter what. By forcing Math.random to a
  // fixed value (such that floor(x*5)+2 = 2 in randomArrayCellValues), EVERY
  // regeneration produces the same unsolvable board: generateBoard must
  // exhaust the 200 attempts and still return that board (documenting the
  // "a solvable board is not guaranteed" case instead of hanging).
  it("exhausts the 200 attempts and still returns a board (potentially unsolvable)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // floor(0*5)+2 = 2 (even) in every cell

    const board = generateBoard(2);

    expect(board).toHaveLength(2);
    expect(hasSolution(board)).toBe(false);
    // 1 initial attempt + 200 retries, 2 cells each time.
    expect(Math.random).toHaveBeenCalledTimes(201 * 2);
  });

  it("with a solution reachable on the first try, it does not retry 200 times", () => {
    // n=2 at an even index is only an example; we use the real generator
    // (without mocking Math.random) and rely on almost any BOARD_SIZE (20)
    // board having a solution in practice.
    const randomSpy = vi.spyOn(Math, "random");
    generateBoard(20);
    expect(randomSpy.mock.calls.length).toBeLessThan(201 * 20);
  });
});
