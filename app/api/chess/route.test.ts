import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/app/lib/chess/db", () => ({
  getChessGame: vi.fn(),
  appendChessMove: vi.fn(),
  deleteChessGame: vi.fn(),
}));
// replayChessMoves/moveToUci se dejan sin mockear: son lógica pura sobre
// chess.js y probarlas de verdad da más confianza que simularlas.

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
  it("responde 400 si falta el nonce", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ move: { from: "e2", to: "e4" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nonce/i);
  });

  it("responde 400 si move no tiene from/to", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ nonce: "n1", move: { from: "e2" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/move must be an object/);
  });

  it("responde 400 si el nonce no existe o es de otro usuario", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockReturnValue(null);

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid or expired nonce/);
  });

  it("responde 400 y borra la partida si supera el máximo de jugadas", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockReturnValue(makeStoredGame(new Array(MAX_PLIES).fill("e2e4")));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/maximum length/);
    expect(deleteChessGame).toHaveBeenCalledWith("n1");
  });

  it("responde 500 y borra la partida si el log guardado está corrupto", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockReturnValue(makeStoredGame(["not-a-move"]));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Corrupted game state/);
    expect(deleteChessGame).toHaveBeenCalledWith("n1");
  });

  it("responde 400 si la partida guardada ya estaba terminada", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    // Mate pastor completo: la partida ya terminó en el log guardado.
    vi.mocked(getChessGame).mockReturnValue(
      makeStoredGame(["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"])
    );

    const res = await POST(request({ nonce: "n1", move: { from: "a2", to: "a3" } }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Game already over/);
  });

  it("responde 400 si la jugada del jugador es ilegal", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockReturnValue(makeStoredGame([]));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e5" } }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Illegal move/);
    expect(appendChessMove).not.toHaveBeenCalled();
  });

  it("responde 409 si appendChessMove falla al grabar la jugada del jugador (CAS)", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockReturnValue(makeStoredGame([]));
    vi.mocked(appendChessMove).mockReturnValue(false);

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Game state changed/);
  });

  it("si la jugada del jugador da mate, responde sin consultar a Stockfish", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    // Un movimiento de la IA (negras) antes del mate final del jugador.
    vi.mocked(getChessGame).mockReturnValue(
      makeStoredGame(["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6"])
    );
    vi.mocked(appendChessMove).mockReturnValue(true);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request({ nonce: "n1", move: { from: "h5", to: "f7" } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ bestmove: null, gameOver: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(appendChessMove).toHaveBeenCalledTimes(1);
  });

  it("flujo normal: graba la jugada del jugador, pide a Stockfish y graba su respuesta", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockReturnValue(makeStoredGame([]));
    vi.mocked(appendChessMove).mockReturnValue(true);
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

  it("responde 500 si Stockfish no devuelve una jugada válida", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockReturnValue(makeStoredGame([]));
    vi.mocked(appendChessMove).mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stockfishResponse(null)));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/bestmove/);
  });

  it("responde 500 si la API de Stockfish no responde ok", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockReturnValue(makeStoredGame([]));
    vi.mocked(appendChessMove).mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => "bad gateway" } as Response)
    );

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Stockfish API error/);
  });

  it("responde 500 si Stockfish propone una jugada ilegal", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockReturnValue(makeStoredGame([]));
    vi.mocked(appendChessMove).mockReturnValue(true);
    // e2e4 no es una jugada legal para las negras en este punto.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stockfishResponse("e2e4")));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Stockfish proposed an illegal move/);
  });

  it("responde 409 si appendChessMove falla al grabar la jugada de la IA (CAS)", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(getChessGame).mockReturnValue(makeStoredGame([]));
    vi.mocked(appendChessMove).mockReturnValueOnce(true).mockReturnValueOnce(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stockfishResponse("e7e5")));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Game state changed/);
  });

  it("responde 500 si requireAuth lanza", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error("No session cookie"));

    const res = await POST(request({ nonce: "n1", move: { from: "e2", to: "e4" } }));
    expect(res.status).toBe(500);
  });
});
