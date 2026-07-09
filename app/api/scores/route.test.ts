import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// LINES_TARGET a 2 solo en este fichero: nos permite reproducir una partida
// completa (2 líneas limpiadas con 5 piezas O) sin resolver Tetris de
// verdad. replayTetris y el resto del motor se dejan sin mockear.
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
  getScoresForGame: vi.fn(),
  getPlayerBestScoreForGame: vi.fn(),
  getPlayerBestScores: vi.fn(),
}));

import { requireAuth } from "@/app/lib/auth";
import { consumeTetrisGame } from "@/app/lib/tetris/db";
import { consumeNumbersGame } from "@/app/lib/numbers/db";
import { consumeWordsGame } from "@/app/lib/words/db";
import { consumeChessGame } from "@/app/lib/chess/db";
import { insertScore } from "@/app/lib/scores/db";
import { LINES_TARGET } from "@/app/lib/tetris/engine";
import { buildTwoRowClearActions, findSeedWithConsecutiveOPieces } from "@/app/lib/tetris/testFixtures";
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
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("POST /api/scores (tetris)", () => {
  it("responde 400 si gameId no es válido", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ gameId: 99, nonce: "n1", actions: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/gameId/);
  });

  it("responde 400 si falta el nonce", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ gameId: 3, actions: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nonce/i);
  });

  it("responde 400 si el nonce no existe, expiró o pertenece a otro usuario", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeTetrisGame).mockResolvedValue(null);

    const res = await POST(request({ gameId: 3, nonce: "n1", actions: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid, expired or already used nonce/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("responde 400 si el replay no alcanza el objetivo de líneas", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeTetrisGame).mockResolvedValue(makeStoredGame());

    // Sin ninguna acción de movimiento real, la partida nunca llega a
    // LINES_TARGET (solo "resume").
    const res = await POST(request({ gameId: 3, nonce: "n1", actions: [{ type: "resume", t: 0 }] }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid game: Target not reached/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("responde 400 si el log de acciones está mal formado", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeTetrisGame).mockResolvedValue(makeStoredGame());

    const res = await POST(request({ gameId: 3, nonce: "n1", actions: "not-an-array" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Malformed or empty action log/);
  });

  it("partida válida: guarda el score (tiempo transcurrido según el reloj del servidor)", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    const seed = findSeedWithConsecutiveOPieces(5);
    vi.mocked(consumeTetrisGame).mockResolvedValue(makeStoredGame({ seed }));
    vi.mocked(insertScore).mockResolvedValue(77);

    const actions = buildTwoRowClearActions();
    const res = await POST(request({ gameId: 3, nonce: "n1", actions }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ message: "Score saved successfully.", id: 77, score: 37_000 });
    expect(insertScore).toHaveBeenCalledWith(
      user,
      3,
      37_000,
      JSON.stringify({ linesTarget: LINES_TARGET })
    );
  });

  it("responde 500 si requireAuth lanza", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error("No session cookie"));

    const res = await POST(request({ gameId: 3, nonce: "n1", actions: [] }));
    expect(res.status).toBe(500);
  });
});

// Tablero "anillo" de 4 casillas con salto 1: 0-1-2-3 es un tour legal
// completo, fácil de razonar a mano para probar validateMoves/boardsMatch
// de verdad (sin mockear app/lib/numbers/board.ts).
function ringBoard(n: number): CellValues[] {
  return Array.from({ length: n }, (_, i) => ({ values: { n: 1, b: false, i } }));
}

function makeStoredNumbersGame(
  overrides: Partial<{ userId: string; board: CellValues[]; createdAt: number }> = {}
) {
  return { userId: "user-1", board: ringBoard(4), createdAt: CREATED_AT, ...overrides };
}

// Movimientos con timestamp, espaciados 100ms (por encima del umbral
// anti-bot de 80ms) desde el arranque del nonce.
function move(i: number, t: number) {
  return { i, t };
}

describe("POST /api/scores (numbers)", () => {
  it("responde 400 si falta el nonce", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(
      request({ gameId: 2, board: ringBoard(4), moves: [move(0, 0), move(1, 100)] })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nonce/i);
  });

  it("responde 400 si falta el board", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ gameId: 2, nonce: "n1", moves: [move(0, 0), move(1, 100)] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/board/i);
  });

  it("responde 400 si el nonce no existe, expiró o pertenece a otro usuario", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeNumbersGame).mockResolvedValue(null);

    const res = await POST(
      request({ gameId: 2, nonce: "n1", board: ringBoard(4), moves: [move(0, 0), move(1, 100)] })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid, expired or already used nonce/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("responde 400 si el board enviado no coincide con el guardado bajo el nonce", async () => {
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

  it("responde 400 si los movimientos no son un tour legal", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeNumbersGame).mockResolvedValue(makeStoredNumbersGame());

    // Salta directamente de 0 a 2 (distancia 2, pero el salto del tablero es 1).
    const res = await POST(
      request({ gameId: 2, nonce: "n1", board: ringBoard(4), moves: [move(0, 0), move(2, 100)] })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid game: Illegal move distance/);
  });

  // Clics reales en un tablero pequeño (botones adyacentes, sin
  // desplazamiento de ratón) caen habitualmente entre 50-80ms de diferencia
  // (medido con Playwright contra la app real) — un suelo de ritmo por clic
  // rechazaba partidas legítimas en silencio. No debe rechazarse solo por
  // ser rápido: la fórmula de score ya acota el incentivo de ir al límite.
  it("acepta clics muy rápidos (50ms) siempre que el tour sea legal", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeNumbersGame).mockResolvedValue(makeStoredNumbersGame());
    vi.mocked(insertScore).mockResolvedValue(1);

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

  it("responde 400 si los timestamps de los clics no son crecientes", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeNumbersGame).mockResolvedValue(makeStoredNumbersGame());

    const res = await POST(
      request({ gameId: 2, nonce: "n1", board: ringBoard(4), moves: [move(0, 100), move(1, 50)] })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid game: Move timestamps out of order/);
  });

  it("responde 400 si el timestamp de un clic excede el tiempo real transcurrido", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeNumbersGame).mockResolvedValue(makeStoredNumbersGame({ createdAt: CREATED_AT }));

    // elapsed real = 37000ms; tolerancia de reloj = 2000ms => máximo t = 39000.
    const res = await POST(
      request({ gameId: 2, nonce: "n1", board: ringBoard(4), moves: [move(0, 0), move(1, 40000)] })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid game: Move timestamp out of range/);
  });

  it("partida válida: calcula el score con steps/tiempo del servidor y lo guarda", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeNumbersGame).mockResolvedValue(makeStoredNumbersGame({ createdAt: CREATED_AT }));
    vi.mocked(insertScore).mockResolvedValue(55);

    // Tour completo de las 4 casillas del anillo: steps=4, elapsed=37000ms
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
    expect(body).toEqual({ message: "Score saved successfully.", id: 55, score: 2 });
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
  it("responde 400 si falta el nonce", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ gameId: 4, nonce: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nonce/i);
  });

  it("responde 400 si el nonce no existe, expiró o pertenece a otro usuario", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeWordsGame).mockResolvedValue(null);

    const res = await POST(request({ gameId: 4, nonce: "n1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid, expired or already used nonce/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("responde 400 si la partida sigue en curso (ni terminó por fallo ni acertó todas las rondas)", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeWordsGame).mockResolvedValue(
      makeStoredWordsGame({ answeredCount: 3, ended: false })
    );

    const res = await POST(request({ gameId: 4, nonce: "n1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Game is not complete/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("partida perdida (ended, aciertos parciales): puntúa igual que una completa, cubo de aciertos entre tiempo", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeWordsGame).mockResolvedValue(
      makeStoredWordsGame({ answeredCount: 4, ended: true })
    );
    vi.mocked(insertScore).mockResolvedValue(11);

    // elapsed=37000ms (NOW - CREATED_AT) => round(4^3*11000/37000) = round(19.027...) = 19.
    const res = await POST(request({ gameId: 4, nonce: "n1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ message: "Score saved successfully.", id: 11, score: 19 });
    expect(insertScore).toHaveBeenCalledWith(
      user,
      4,
      19,
      JSON.stringify({ wordsTotal: 10, correctAnswers: 4 })
    );
  });

  it("partida completa (10/10 aciertos): puntúa sin necesitar el flag ended", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeWordsGame).mockResolvedValue(
      makeStoredWordsGame({ answeredCount: 10, ended: false })
    );
    vi.mocked(insertScore).mockResolvedValue(22);

    // elapsed=37000ms => round(10^3*11000/37000) = round(297.297...) = 297.
    const res = await POST(request({ gameId: 4, nonce: "n1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ message: "Score saved successfully.", id: 22, score: 297 });
    expect(insertScore).toHaveBeenCalledWith(
      user,
      4,
      297,
      JSON.stringify({ wordsTotal: 10, correctAnswers: 10 })
    );
  });
});

// Secuencias reales de ajedrez (UCI) usadas para probar saveChessScore /
// replayChessMoves de verdad (sin mockear chess.js): el mate del pastor
// (el jugador, con blancas, da mate) y el mate del necio (el jugador recibe
// mate en su propia jugada 2, el caso "autoinfligido" que NO debe puntuar).
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
  it("responde 400 si falta el nonce", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);

    const res = await POST(request({ gameId: 1, nonce: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nonce/i);
  });

  it("responde 400 si el nonce no existe, expiró o pertenece a otro usuario", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeChessGame).mockResolvedValue(null);

    const res = await POST(request({ gameId: 1, nonce: "n1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid, expired or already used nonce/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("responde 400 si el log de jugadas guardado tiene una jugada ilegal", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeChessGame).mockResolvedValue(makeStoredChessGame({ moves: ["e2e5"] }));

    const res = await POST(request({ gameId: 1, nonce: "n1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid game: Illegal move in recorded history/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("responde 400 si la partida guardada no ha terminado", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeChessGame).mockResolvedValue(
      makeStoredChessGame({ moves: ["e2e4", "e7e5"] })
    );

    const res = await POST(request({ gameId: 1, nonce: "n1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Game is not complete/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  // Mate del necio: la partida SÍ termina, pero es el propio jugador (blancas)
  // quien recibe jaque mate — el caso "autoinfligido" que el comentario de
  // saveChessScore explícitamente dice que no debe puntuar.
  it("responde 400 si la partida termina en mate autoinfligido (pierde el jugador)", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeChessGame).mockResolvedValue(makeStoredChessGame({ moves: FOOLS_MATE }));

    const res = await POST(request({ gameId: 1, nonce: "n1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Game did not end in a win for the player/);
    expect(insertScore).not.toHaveBeenCalled();
  });

  it("partida válida (el jugador da mate): guarda el score (elo) y el nº de jugadas", async () => {
    vi.mocked(requireAuth).mockResolvedValue(user);
    vi.mocked(consumeChessGame).mockResolvedValue(
      makeStoredChessGame({ elo: 1500, moves: SCHOLARS_MATE })
    );
    vi.mocked(insertScore).mockResolvedValue(99);

    const res = await POST(request({ gameId: 1, nonce: "n1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ message: "Score saved successfully.", id: 99, score: 1500 });
    expect(insertScore).toHaveBeenCalledWith(
      user,
      1,
      1500,
      JSON.stringify({ elo: 1500, plies: SCHOLARS_MATE.length })
    );
  });

  it("responde 500 si requireAuth lanza", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error("No session cookie"));

    const res = await POST(request({ gameId: 1, nonce: "n1" }));
    expect(res.status).toBe(500);
  });
});
