import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/app/lib/chess/db", () => ({
  getChessGame: vi.fn(),
  appendChessMove: vi.fn(),
  deleteChessGame: vi.fn(),
}));
// replayChessMoves/moveToUci are left unmocked: they are pure logic on top of
// chess.js, and testing them for real gives more confidence than faking them.

import { requireAuth } from "@/app/lib/auth";
import { appendChessMove, deleteChessGame, getChessGame } from "@/app/lib/chess/db";
import { MAX_PLIES } from "@/app/lib/chess/replay";
import { POST } from "./route";

const user = { id: "user-1", name: "Test", email: "t@t.com" };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/chess", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeStoredGame(moves: string[], overrides: Partial<{ userId: string; elo: number }> = {}) {
  return {
    userId: "user-1",
    elo: 1200,
    moves,
    movesJson: JSON.stringify(moves),
    createdAt: Date.now(),
    ...overrides,
  };
}

function stockfishResponse(bestmove: string | null): Response {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      response: bestmove ? [`bestmove ${bestmove}`] : ["info string no move"],
    }),
  } as unknown as Response;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("POST /api/chess", () => {
  it("responds 400 if the nonce is missing", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ move: { from: "e2", to: "e4" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nonce/i);
  });

  it("responds 400 if move has no from/to", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ nonce: "n1", move: { from: "e2" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/move must be an object/);
  });

  it("responds 400 if the nonce does not exist or belongs to another user", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockResolvedValue(null);

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid or expired nonce/);
  });

  it("responds 400 and deletes the game if it exceeds the maximum number of moves", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockResolvedValue(makeStoredGame(new Array(MAX_PLIES).fill("e2e4")));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/maximum length/);
    expect(deleteChessGame).toHaveBeenCalledWith("n1");
  });

  it("responds 500 and deletes the game if the stored log is corrupted", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockResolvedValue(makeStoredGame(["not-a-move"]));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Corrupted game state/);
    expect(deleteChessGame).toHaveBeenCalledWith("n1");
  });

  it("responds 400 if the stored game was already over", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    // Full Scholar's Mate: the game already ended in the stored log.
    vi.mocked(getChessGame).mockResolvedValue(
      makeStoredGame(["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"])
    );

    const res = await POST(request({ nonce: "n1", move: { from: "a2", to: "a3" } }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Game already over/);
  });

  it("responds 400 if the player's move is illegal", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockResolvedValue(makeStoredGame([]));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e5" } }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Illegal move/);
    expect(appendChessMove).not.toHaveBeenCalled();
  });

  it("responds 409 if appendChessMove fails to record the player's move (CAS)", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockResolvedValue(makeStoredGame([]));
    vi.mocked(appendChessMove).mockResolvedValue(false);

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Game state changed/);
  });

  it("if the player's move delivers mate, responds without querying Stockfish", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    // One AI (Black) move before the player's final mate.
    vi.mocked(getChessGame).mockResolvedValue(
      makeStoredGame(["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6"])
    );
    vi.mocked(appendChessMove).mockResolvedValue(true);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request({ nonce: "n1", move: { from: "h5", to: "f7" } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ bestmove: null, gameOver: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(appendChessMove).toHaveBeenCalledTimes(1);
  });

  it("normal flow: records the player's move, asks Stockfish and records its reply", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockResolvedValue(makeStoredGame([]));
    vi.mocked(appendChessMove).mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stockfishResponse("e7e5")));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ bestmove: "e7e5", gameOver: false });
    expect(appendChessMove).toHaveBeenCalledTimes(2);
    expect(appendChessMove).toHaveBeenNthCalledWith(1, "n1", JSON.stringify([]), "e2e4");
    expect(appendChessMove).toHaveBeenNthCalledWith(
      2,
      "n1",
      JSON.stringify(["e2e4"]),
      "e7e5"
    );
  });

  it("responds 500 if Stockfish does not return a valid move", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockResolvedValue(makeStoredGame([]));
    vi.mocked(appendChessMove).mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stockfishResponse(null)));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/bestmove/);
  });

  it("responds 500 if the Stockfish API does not respond ok", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockResolvedValue(makeStoredGame([]));
    vi.mocked(appendChessMove).mockResolvedValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => "bad gateway" } as Response)
    );

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Stockfish API error/);
  });

  it("responds 500 if Stockfish proposes an illegal move", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockResolvedValue(makeStoredGame([]));
    vi.mocked(appendChessMove).mockResolvedValue(true);
    // e2e4 is not a legal move for Black at this point.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stockfishResponse("e2e4")));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Stockfish proposed an illegal move/);
  });

  it("responds 409 if appendChessMove fails to record the AI's move (CAS)", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockResolvedValue(makeStoredGame([]));
    vi.mocked(appendChessMove).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stockfishResponse("e7e5")));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Game state changed/);
  });

  it("responds 500 if requireAuth throws", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error("No session cookie"));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));
    expect(res.status).toBe(500);
  });
});
