import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// LINES_TARGET set to 2 in this file only: it lets us replay a complete game
// (2 lines cleared with 5 O pieces) without actually solving Tetris.
// replayTetris and the rest of the engine are left unmocked.
vi.mock("@/app/lib/tetris/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/tetris/engine")>();
  return { ...actual, LINES_TARGET: 2 };
});

vi.mock("@/app/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/app/lib/tetris/db", () => ({ consumeTetrisGame: vi.fn() }));
vi.mock("@/app/lib/numbers/db", () => ({ consumeNumbersGame: vi.fn() }));
vi.mock("@/app/lib/words/db", () => ({ consumeWordsGame: vi.fn() }));
vi.mock("@/app/lib/chess/db", () => ({ consumeChessGame: vi.fn() }));
vi.mock("@/app/lib/scores/db", () => ({
  getDb: vi.fn(),
  ensureUser: vi.fn(),
  insertScore: vi.fn(),
  getScoreRank: vi.fn(),
  getScoresForGame: vi.fn(),
  getPlayerBestScoreForGame: vi.fn(),
  getPlayerBestScores: vi.fn(),
  getPlayersBeatenByScore: vi.fn(),
}));
vi.mock("@/app/lib/nextcloud/gamingApp", () => ({ postToGamingApp: vi.fn() }));

import { requireAuth } from "@/app/lib/auth";
import { consumeTetrisGame } from "@/app/lib/tetris/db";
import { consumeNumbersGame } from "@/app/lib/numbers/db";
import { consumeWordsGame } from "@/app/lib/words/db";
import { consumeChessGame } from "@/app/lib/chess/db";
import {
  insertScore,
  getScoreRank,
  getPlayerBestScoreForGame,
  getPlayersBeatenByScore,
} from "@/app/lib/scores/db";
import { postToGamingApp } from "@/app/lib/nextcloud/gamingApp";
import { LINES_TARGET } from "@/app/lib/tetris/engine";
import { buildTwoRowClearActions, findSeedWithConsecutiveOPieces } from "@/app/lib/tetris/testFixtures";
import { THREEFOLD_REPETITION_DRAW } from "@/app/lib/chess/testFixtures";
import type { CellValues } from "@/app/types";
import { POST } from "./route";

const user = { id: "user-1", name: "Test", email: "t@t.com" };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/scores", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const CREATED_AT = 1_700_000_000_000;
const NOW = CREATED_AT + 37_000;

function makeStoredGame(overrides: Partial<{ userId: string; seed: number; createdAt: number }> = {}) {
  return { userId: "user-1", seed: 1, createdAt: CREATED_AT, ...overrides };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // Every valid game publishes to Nextcloud: by default, with no records
  // beaten and Nextcloud responding OK.
  vi.mocked(getPlayerBestScoreForGame).mockResolvedValue(null);
  vi.mocked(getPlayersBeatenByScore).mockResolvedValue([]);
  vi.mocked(postToGamingApp).mockResolvedValue(new Response("{}", { status: 200 }));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("POST /api/scores (tetris)", () => {
  it("responds 400 if gameId is not valid", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ gameId: 99, nonce: "n1", actions: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/gameId/);
  });

  it("responds 400 if the nonce is missing", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ gameId: 3, actions: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nonce/i);
  });

  it("responds 400 if the nonce does not exist, has expired or belongs to another user", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeTetrisGame).mockResolvedValue(null);

    const res = await POST(request({ gameId: 3, nonce: "n1", actions: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid, expired or already used nonce/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("responds 400 if the replay does not reach the line target", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeTetrisGame).mockResolvedValue(makeStoredGame());

    // Without any real movement action, the game never reaches
    // LINES_TARGET (only "resume").
    const res = await POST(request({ gameId: 3, nonce: "n1", actions: [{ type: "resume", t: 0 }] }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid game: Target not reached/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("responds 400 if the action log is malformed", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeTetrisGame).mockResolvedValue(makeStoredGame());

    const res = await POST(request({ gameId: 3, nonce: "n1", actions: "not-an-array" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Malformed or empty action log/);
  });

  it("valid game: saves the score (elapsed time according to the server clock)", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    const seed = findSeedWithConsecutiveOPieces(5);
    vi.mocked(consumeTetrisGame).mockResolvedValue(makeStoredGame({ seed }));
    vi.mocked(insertScore).mockResolvedValue(77);
    vi.mocked(getScoreRank).mockResolvedValue({ rank: 4, total: 12 });

    const actions = buildTwoRowClearActions();
    const res = await POST(request({ gameId: 3, nonce: "n1", actions }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      message: "Score saved successfully.",
      id: 77,
      score: 37_000,
      rank: 4,
      total: 12,
    });
    expect(insertScore).toHaveBeenCalledWith(
      user,
      3,
      37_000,
      JSON.stringify({ linesTarget: LINES_TARGET })
    );
  });

  it("responds 500 if requireAuth throws", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error("No session cookie"));

    const res = await POST(request({ gameId: 3, nonce: "n1", actions: [] }));
    expect(res.status).toBe(500);
  });
});

// 4-cell "ring" board with jump 1: 0-1-2-3 is a complete legal tour, easy
// to reason about by hand, to test validateMoves/boardsMatch for real
// (without mocking app/lib/numbers/board.ts).
function ringBoard(n: number): CellValues[] {
  return Array.from({ length: n }, (_, i) => ({ values: { n: 1, b: false, i } }));
}

function makeStoredNumbersGame(
  overrides: Partial<{ userId: string; board: CellValues[]; createdAt: number }> = {}
) {
  return { userId: "user-1", board: ringBoard(4), createdAt: CREATED_AT, ...overrides };
}

// Timestamped moves, spaced 100ms apart (above the 80ms anti-bot
// threshold) from when the nonce started.
function move(i: number, t: number) {
  return { i, t };
}

describe("POST /api/scores (numbers)", () => {
  it("responds 400 if the nonce is missing", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(
      request({ gameId: 2, board: ringBoard(4), moves: [move(0, 0), move(1, 100)] })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nonce/i);
  });

  it("responds 400 if the board is missing", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ gameId: 2, nonce: "n1", moves: [move(0, 0), move(1, 100)] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/board/i);
  });

  it("responds 400 if the nonce does not exist, has expired or belongs to another user", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeNumbersGame).mockResolvedValue(null);

    const res = await POST(
      request({ gameId: 2, nonce: "n1", board: ringBoard(4), moves: [move(0, 0), move(1, 100)] })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid, expired or already used nonce/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("responds 400 if the submitted board does not match the one stored under the nonce", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeNumbersGame).mockResolvedValue(makeStoredNumbersGame());

    const tamperedBoard = ringBoard(4).map((c) => ({ values: { ...c.values, n: 5 } }));
    const res = await POST(
      request({ gameId: 2, nonce: "n1", board: tamperedBoard, moves: [move(0, 0), move(1, 100)] })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Board does not match the nonce/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("responds 400 if the moves are not a legal tour", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeNumbersGame).mockResolvedValue(makeStoredNumbersGame());

    // Jumps straight from 0 to 2 (distance 2, but the board's jump is 1).
    const res = await POST(
      request({ gameId: 2, nonce: "n1", board: ringBoard(4), moves: [move(0, 0), move(2, 100)] })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid game: Illegal move distance/);
  });

  // Real clicks on a small board (adjacent buttons, no mouse travel)
  // typically land 50-80ms apart (measured with Playwright against the real
  // app) — a per-click pace floor was silently rejecting legitimate games.
  // A game must not be rejected just for being fast: the score formula
  // already caps the incentive to push the limit.
  it("accepts very fast clicks (50ms) as long as the tour is legal", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeNumbersGame).mockResolvedValue(makeStoredNumbersGame());
    vi.mocked(insertScore).mockResolvedValue(1);
    vi.mocked(getScoreRank).mockResolvedValue({ rank: 1, total: 1 });

    const res = await POST(
      request({
        gameId: 2,
        nonce: "n1",
        board: ringBoard(4),
        moves: [move(0, 0), move(1, 50), move(2, 100), move(3, 150)],
      })
    );

    expect(res.status).toBe(200);
  });

  it("responds 400 if the click timestamps are not increasing", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeNumbersGame).mockResolvedValue(makeStoredNumbersGame());

    const res = await POST(
      request({ gameId: 2, nonce: "n1", board: ringBoard(4), moves: [move(0, 100), move(1, 50)] })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid game: Move timestamps out of order/);
  });

  it("responds 400 if a click timestamp exceeds the real elapsed time", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeNumbersGame).mockResolvedValue(makeStoredNumbersGame({ createdAt: CREATED_AT }));

    // real elapsed = 37000ms; clock tolerance = 2000ms => max t = 39000.
    const res = await POST(
      request({ gameId: 2, nonce: "n1", board: ringBoard(4), moves: [move(0, 0), move(1, 40000)] })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid game: Move timestamp out of range/);
  });

  it("valid game: computes the score from server-side steps/time and saves it", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeNumbersGame).mockResolvedValue(makeStoredNumbersGame({ createdAt: CREATED_AT }));
    vi.mocked(insertScore).mockResolvedValue(55);
    vi.mocked(getScoreRank).mockResolvedValue({ rank: 6, total: 20 });

    // Full tour of the ring's 4 cells: steps=4, elapsed=37000ms
    // (NOW - CREATED_AT). pace = max(37000/4, 150) = 9250 =>
    // round(4^2 * 1000 / 9250) = round(1.7297...) = 2.
    const res = await POST(
      request({
        gameId: 2,
        nonce: "n1",
        board: ringBoard(4),
        moves: [move(0, 0), move(1, 100), move(2, 200), move(3, 300)],
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      message: "Score saved successfully.",
      id: 55,
      score: 2,
      rank: 6,
      total: 20,
    });
    expect(insertScore).toHaveBeenCalledWith(user, 2, 2, JSON.stringify({ steps: 4 }));
  });
});

function makeStoredWordsGame(
  overrides: Partial<{
    userId: string;
    rounds: { target: string; audio: string; choices: string[] }[];
    answeredCount: number;
    ended: boolean;
    createdAt: number;
  }> = {}
) {
  return {
    userId: "user-1",
    rounds: Array.from({ length: 10 }, (_, i) => ({
      target: `word-${i}`,
      audio: `/audio/${i}.mp3`,
      choices: [`word-${i}`, "otra"],
    })),
    answeredCount: 10,
    ended: false,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe("POST /api/scores (words)", () => {
  it("responds 400 if the nonce is missing", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ gameId: 4, nonce: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nonce/i);
  });

  it("responds 400 if the nonce does not exist, has expired or belongs to another user", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeWordsGame).mockResolvedValue(null);

    const res = await POST(request({ gameId: 4, nonce: "n1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid, expired or already used nonce/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("responds 400 if the game is still in progress (neither ended by a miss nor all rounds answered)", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeWordsGame).mockResolvedValue(
      makeStoredWordsGame({ answeredCount: 3, ended: false })
    );

    const res = await POST(request({ gameId: 4, nonce: "n1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Game is not complete/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("lost game (ended, partial correct answers): scores like a complete one, correct answers cubed over time", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeWordsGame).mockResolvedValue(
      makeStoredWordsGame({ answeredCount: 4, ended: true })
    );
    vi.mocked(insertScore).mockResolvedValue(11);
    vi.mocked(getScoreRank).mockResolvedValue({ rank: 7, total: 15 });

    // elapsed=37000ms (NOW - CREATED_AT) => round(4^3*11000/37000) = round(19.027...) = 19.
    const res = await POST(request({ gameId: 4, nonce: "n1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      message: "Score saved successfully.",
      id: 11,
      score: 19,
      rank: 7,
      total: 15,
    });
    expect(insertScore).toHaveBeenCalledWith(
      user,
      4,
      19,
      JSON.stringify({ wordsTotal: 10, correctAnswers: 4 })
    );
  });

  it("complete game (10/10 correct): scores without needing the ended flag", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeWordsGame).mockResolvedValue(
      makeStoredWordsGame({ answeredCount: 10, ended: false })
    );
    vi.mocked(insertScore).mockResolvedValue(22);
    vi.mocked(getScoreRank).mockResolvedValue({ rank: 1, total: 15 });

    // elapsed=37000ms => round(10^3*11000/37000) = round(297.297...) = 297.
    const res = await POST(request({ gameId: 4, nonce: "n1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      message: "Score saved successfully.",
      id: 22,
      score: 297,
      rank: 1,
      total: 15,
    });
    expect(insertScore).toHaveBeenCalledWith(
      user,
      4,
      297,
      JSON.stringify({ wordsTotal: 10, correctAnswers: 10 })
    );
  });
});

// Real chess sequences (UCI) used to test saveChessScore / replayChessMoves
// for real (without mocking chess.js): Scholar's Mate (the player, as White,
// delivers mate) and Fool's Mate (the player gets mated on their own move 2,
// the "self-inflicted" case that must NOT score).
const SCHOLARS_MATE = ["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"];
const FOOLS_MATE = ["f2f3", "e7e5", "g2g4", "d8h4"];

function makeStoredChessGame(
  overrides: Partial<{ userId: string; elo: number; moves: string[]; createdAt: number }> = {}
) {
  return {
    userId: "user-1",
    elo: 1500,
    moves: SCHOLARS_MATE,
    movesJson: JSON.stringify(overrides.moves ?? SCHOLARS_MATE),
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe("POST /api/scores (chess)", () => {
  it("responds 400 if the nonce is missing", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ gameId: 1, nonce: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nonce/i);
  });

  it("responds 400 if the nonce does not exist, has expired or belongs to another user", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeChessGame).mockResolvedValue(null);

    const res = await POST(request({ gameId: 1, nonce: "n1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid, expired or already used nonce/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("responds 400 if the stored move log contains an illegal move", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeChessGame).mockResolvedValue(makeStoredChessGame({ moves: ["e2e5"] }));

    const res = await POST(request({ gameId: 1, nonce: "n1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid game: Illegal move in recorded history/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("responds 400 if the stored game has not finished", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeChessGame).mockResolvedValue(
      makeStoredChessGame({ moves: ["e2e4", "e7e5"] })
    );

    const res = await POST(request({ gameId: 1, nonce: "n1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Game is not complete/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  // Fool's Mate: the game DOES end, but it's the player themselves (White)
  // who gets checkmated — the "self-inflicted" case that the saveChessScore
  // comment explicitly says must not score.
  it("responds 400 if the game ends in a self-inflicted mate (the player loses)", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeChessGame).mockResolvedValue(makeStoredChessGame({ moves: FOOLS_MATE }));

    const res = await POST(request({ gameId: 1, nonce: "n1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Game did not end in a win for the player/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  // Draw by threefold repetition: replay.gameOver is true (chess.isGameOver()
  // is also true on a draw), but it's not checkmate — it must not be mistaken
  // for a player win nor score. It doesn't depend on Stockfish/docker: it's
  // a real game playable with chess.js (see app/lib/chess/testFixtures.ts).
  it("responds 400 if the game ends in a draw (does not count as a win)", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeChessGame).mockResolvedValue(
      makeStoredChessGame({ moves: THREEFOLD_REPETITION_DRAW })
    );

    const res = await POST(request({ gameId: 1, nonce: "n1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Game did not end in a win for the player/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("valid game (the player delivers mate): saves the score (elo) and the move count", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeChessGame).mockResolvedValue(
      makeStoredChessGame({ elo: 1500, moves: SCHOLARS_MATE })
    );
    vi.mocked(insertScore).mockResolvedValue(99);
    vi.mocked(getScoreRank).mockResolvedValue({ rank: 3, total: 10 });

    const res = await POST(request({ gameId: 1, nonce: "n1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      message: "Score saved successfully.",
      id: 99,
      score: 1500,
      rank: 3,
      total: 10,
    });
    expect(insertScore).toHaveBeenCalledWith(
      user,
      1,
      1500,
      JSON.stringify({ elo: 1500, plies: SCHOLARS_MATE.length })
    );
  });

  it("responds 500 if requireAuth throws", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error("No session cookie"));

    const res = await POST(request({ gameId: 1, nonce: "n1" }));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/scores → Nextcloud gaming app", () => {
  it("publishes the activity and notifies the beaten players with userId and a deeplink to the game", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    const seed = findSeedWithConsecutiveOPieces(5);
    vi.mocked(consumeTetrisGame).mockResolvedValue(makeStoredGame({ seed }));
    vi.mocked(insertScore).mockResolvedValue(77);
    vi.mocked(getScoreRank).mockResolvedValue({ rank: 1, total: 2 });
    vi.mocked(getPlayerBestScoreForGame).mockResolvedValue(null);
    vi.mocked(getPlayersBeatenByScore).mockResolvedValue([
      { userId: "ana", username: "Ana", previousBest: 40_000 },
    ]);
    vi.mocked(postToGamingApp).mockResolvedValue(new Response("{}", { status: 200 }));

    const res = await POST(
      new NextRequest("http://localhost/api/scores", {
        method: "POST",
        body: JSON.stringify({ gameId: 3, nonce: "n1", actions: buildTwoRowClearActions() }),
        headers: { "Content-Type": "application/json", cookie: "nc_session=abc" },
      })
    );

    expect(res.status).toBe(200);
    const common = {
      userId: "user-1",
      game: "Tetris",
      score: 37_000,
      scoreLabel: "37.000s",
      path: "/pages/games/tetris",
    };
    expect(postToGamingApp).toHaveBeenCalledWith("score", common, "nc_session=abc");
    expect(postToGamingApp).toHaveBeenCalledWith(
      "notify",
      {
        ...common,
        targetUserId: "ana",
        previousScore: 40_000,
        previousScoreLabel: "40.000s",
      },
      "nc_session=abc"
    );
  });

  it("if Nextcloud fails, the score is saved anyway", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    const seed = findSeedWithConsecutiveOPieces(5);
    vi.mocked(consumeTetrisGame).mockResolvedValue(makeStoredGame({ seed }));
    vi.mocked(insertScore).mockResolvedValue(77);
    vi.mocked(getScoreRank).mockResolvedValue({ rank: 1, total: 1 });
    vi.mocked(getPlayerBestScoreForGame).mockResolvedValue(null);
    vi.mocked(getPlayersBeatenByScore).mockResolvedValue([]);
    vi.mocked(postToGamingApp).mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await POST(request({ gameId: 3, nonce: "n1", actions: buildTwoRowClearActions() }));

    expect(res.status).toBe(200);
    expect(insertScore).toHaveBeenCalled();
  });
});
