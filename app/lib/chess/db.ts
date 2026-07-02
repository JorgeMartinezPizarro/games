import { getDb } from "@/app/lib/scores/db";
import crypto from "node:crypto";

// Nonces caducan a los 60 minutos: a diferencia de numbers/words/tetris,
// una partida de ajedrez incluye tiempo de pensar del jugador en cada
// jugada, no solo un log de acciones automatizado.
const NONCE_MAX_AGE_MS = 60 * 60 * 1000;

const MIN_ELO = 400;
const MAX_ELO = 3000;

let _tableReady = false;

function ensureTable(): void {
  if (_tableReady) return;

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS game_chess (
      nonce TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      elo INTEGER NOT NULL,
      moves TEXT NOT NULL DEFAULT '[]',
      createdAt INTEGER NOT NULL
    )
  `);

  _tableReady = true;
}

export type NewChessGame = {
  nonce: string;
  timestamp: number;
};

export function createChessGame(userId: string, elo: number): NewChessGame {
  ensureTable();

  if (!Number.isInteger(elo) || elo < MIN_ELO || elo > MAX_ELO) {
    throw new Error(`elo must be an integer between ${MIN_ELO} and ${MAX_ELO}.`);
  }

  const nonce = crypto.randomUUID();
  const timestamp = Date.now();

  getDb()
    .prepare(
      `INSERT INTO game_chess (nonce, userId, elo, moves, createdAt) VALUES (?, ?, ?, '[]', ?)`
    )
    .run(nonce, userId, elo, timestamp);

  return { nonce, timestamp };
}

export type ChessGameState = {
  userId: string;
  elo: number;
  moves: string[];
  movesJson: string;
  createdAt: number;
};

export function deleteChessGame(nonce: string): void {
  ensureTable();
  getDb().prepare(`DELETE FROM game_chess WHERE nonce = ?`).run(nonce);
}

export function getChessGame(nonce: string): ChessGameState | null {
  ensureTable();

  const row = getDb()
    .prepare(`SELECT userId, elo, moves, createdAt FROM game_chess WHERE nonce = ?`)
    .get(nonce) as
    | { userId: string; elo: number; moves: string; createdAt: number }
    | undefined;

  if (!row) return null;

  if (Date.now() - row.createdAt > NONCE_MAX_AGE_MS) {
    deleteChessGame(nonce);
    return null;
  }

  return {
    userId: row.userId,
    elo: row.elo,
    moves: JSON.parse(row.moves) as string[],
    movesJson: row.moves,
    createdAt: row.createdAt,
  };
}

// Append con compare-and-swap: solo escribe si el contenido de `moves`
// coincide exactamente con lo que se leyó (expectedMovesJson). A diferencia
// de numbers/words/tetris, aquí hay un await de red (Stockfish) entre la
// jugada del jugador y la de la IA dentro de la misma petición — dos
// peticiones concurrentes para el mismo nonce podrían pisarse sin esto.
export function appendChessMove(
  nonce: string,
  expectedMovesJson: string,
  uciMove: string
): boolean {
  ensureTable();

  const moves = JSON.parse(expectedMovesJson) as string[];
  moves.push(uciMove);

  const result = getDb()
    .prepare(`UPDATE game_chess SET moves = ? WHERE nonce = ? AND moves = ?`)
    .run(JSON.stringify(moves), nonce, expectedMovesJson);

  return result.changes === 1;
}

// Lectura + borrado en un paso: solo puede usarse una vez para guardar el
// score final, tanto si la partida estaba completa como si no.
export function consumeChessGame(nonce: string): ChessGameState | null {
  const game = getChessGame(nonce);
  if (!game) return null;
  deleteChessGame(nonce);
  return game;
}
