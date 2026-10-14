import { describe, expect, it, vi } from "vitest";

// LINES_TARGET set to 2 in this file only: lets us replay a complete game
// (2 lines cleared with 5 O pieces) without actually solving Tetris, same
// as in app/api/scores/route.test.ts.
vi.mock("@/app/lib/tetris/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/tetris/engine")>();
  return { ...actual, LINES_TARGET: 2 };
});

import { MAX_ACTIONS, MAX_DURATION_MS, replayTetris } from "./replay";
import {
  buildTwoRowClearActions,
  buildWallKickExhaustionActions,
  findSeedWithConsecutiveOPieces,
  findSeedWithPieceSequence,
  WALL_KICK_SEQUENCE,
} from "./testFixtures";

describe("replayTetris — sanity bounds", () => {
  it("MAX_ACTIONS + 1 actions is rejected outright for length", () => {
    const actions = Array.from({ length: MAX_ACTIONS + 1 }, (_, i) => ({ type: "tick", t: i }));
    expect(replayTetris(1, actions)).toEqual({
      valid: false,
      reason: "Malformed or empty action log.",
    });
  });

  it("exactly MAX_ACTIONS actions is not rejected for length (fails later, by the game rules)", () => {
    const actions = Array.from({ length: MAX_ACTIONS }, (_, i) => ({ type: "tick", t: i }));
    const replay = replayTetris(1, actions);

    expect(replay.valid).toBe(false);
    if (replay.valid) return;
    expect(replay.reason).not.toMatch(/Malformed or empty action log/);
  });

  it("a timestamp greater than MAX_DURATION_MS is rejected as a malformed log", () => {
    const replay = replayTetris(1, [{ type: "resume", t: MAX_DURATION_MS + 1 }]);
    expect(replay).toEqual({ valid: false, reason: "Malformed or empty action log." });
  });

  it("a timestamp equal to MAX_DURATION_MS is not rejected for duration", () => {
    const replay = replayTetris(1, [{ type: "resume", t: MAX_DURATION_MS }]);
    expect(replay.valid).toBe(false);
    if (replay.valid) return;
    expect(replay.reason).not.toMatch(/Malformed or empty action log/);
  });

  it("rejects an empty array", () => {
    expect(replayTetris(1, [])).toEqual({
      valid: false,
      reason: "Malformed or empty action log.",
    });
  });

  it("rejects out-of-order (decreasing) timestamps", () => {
    const replay = replayTetris(1, [
      { type: "resume", t: 10 },
      { type: "tick", t: 5 },
    ]);
    expect(replay).toEqual({ valid: false, reason: "Malformed or empty action log." });
  });
});

describe("replayTetris — tampering with the log after the game ends", () => {
  it("actions appended after completing the target are ignored (they don't change the result)", () => {
    const seed = findSeedWithConsecutiveOPieces(5);
    const cleanActions = buildTwoRowClearActions();

    const baseline = replayTetris(seed, cleanActions);
    expect(baseline).toEqual({ valid: true, lines: 2 });

    const lastT = cleanActions[cleanActions.length - 1].t;
    const tampered = [
      ...cleanActions,
      { type: "left", t: lastT + 1 },
      { type: "rotateRight", t: lastT + 2 },
      { type: "softDrop", t: lastT + 3 },
    ];

    expect(replayTetris(seed, tampered)).toEqual(baseline);
  });
});

describe("replayTetris — wall-kick exhaustion", () => {
  // A vertical I piece against the right wall (column 9) can't rotate to
  // horizontal: none of the 5 wall-kick offsets ([0,-1,1,-2,2]) fits on a
  // 10-column board (a horizontal I only fits up to x=6). The rotation must
  // be a silent no-op, without throwing and without moving the piece. This
  // is verified indirectly but unambiguously: the rest of the game (4 O +
  // another I) only completes the 2 bottom rows if column 9 locked where it
  // should — if the wall-kick had "slipped" outside the bounds, those rows
  // would never have been completed.
  it("a vertical I against the wall does not rotate (all kicks collide) and the game continues normally", () => {
    const seed = findSeedWithPieceSequence(WALL_KICK_SEQUENCE);
    const actions = buildWallKickExhaustionActions();

    const replay = replayTetris(seed, actions);

    expect(replay).toEqual({ valid: true, lines: 2 });
  });
});
