import { describe, expect, it } from "vitest";
import { MAX_PLIES, replayChessMoves, uciMoveToParts } from "./replay";
import { THREEFOLD_REPETITION_DRAW } from "./testFixtures";

describe("uciMoveToParts", () => {
  it("accepts 4- and 5-character moves (with promotion)", () => {
    expect(uciMoveToParts("e2e4")).toEqual({ from: "e2", to: "e4", promotion: undefined });
    expect(uciMoveToParts("a7a8q")).toEqual({ from: "a7", to: "a8", promotion: "q" });
  });

  it("rejects lengths other than 4/5 and non-string values", () => {
    expect(uciMoveToParts("e2e")).toBeNull();
    expect(uciMoveToParts("e2e44q")).toBeNull();
    expect(uciMoveToParts(123)).toBeNull();
    expect(uciMoveToParts(null)).toBeNull();
  });
});

describe("replayChessMoves", () => {
  it("game drawn by threefold repetition: gameOver true but not checkmate", () => {
    const replay = replayChessMoves(THREEFOLD_REPETITION_DRAW);

    expect(replay.valid).toBe(true);
    if (!replay.valid) return;
    expect(replay.gameOver).toBe(true);
    expect(replay.chess.isCheckmate()).toBe(false);
    expect(replay.chess.isThreefoldRepetition()).toBe(true);
    // No drawn game must be able to score as a player win.
    const playerWon = replay.chess.isCheckmate() && replay.chess.turn() === "b";
    expect(playerWon).toBe(false);
  });

  it("exactly MAX_PLIES moves is not rejected for length (fails later, as illegal)", () => {
    const moves = new Array(MAX_PLIES).fill("a1a1"); // illegal from the 1st move, but of valid length
    const replay = replayChessMoves(moves);

    expect(replay.valid).toBe(false);
    if (replay.valid) return;
    expect(replay.reason).toMatch(/Illegal move in recorded history/);
  });

  it("MAX_PLIES + 1 moves is rejected outright for length", () => {
    const moves = new Array(MAX_PLIES + 1).fill("a1a1");
    const replay = replayChessMoves(moves);

    expect(replay.valid).toBe(false);
    if (replay.valid) return;
    expect(replay.reason).toMatch(/Malformed or too-long move log/);
  });

  it("empty game: valid, initial board, not over", () => {
    const replay = replayChessMoves([]);

    expect(replay.valid).toBe(true);
    if (!replay.valid) return;
    expect(replay.gameOver).toBe(false);
  });

  it("rejects a value that is not an array of moves", () => {
    expect(replayChessMoves("not-an-array")).toEqual({
      valid: false,
      reason: "Malformed or too-long move log.",
    });
  });

  it("rejects a move with invalid UCI format (wrong length)", () => {
    const replay = replayChessMoves(["e2e4extra"]);
    expect(replay.valid).toBe(false);
    if (replay.valid) return;
    expect(replay.reason).toMatch(/Malformed move/);
  });
});
