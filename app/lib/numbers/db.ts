import { getDb } from "@/app/lib/scores/db";
import { generateBoard } from "@/app/lib/numbers/board";
import type { CellValues } from "@/app/types";
import crypto from "node:crypto";

// Nonces caducan a los 15 minutos: tiempo de sobra para jugar una partida,
// evita que se acumulen filas huérfanas si nunca se envía el score.
const NONCE_MAX_AGE_MS = 15 * 60 * 1000;

let _tableReady = false;

function ensureTable(): void {
  if (_tableReady) return;

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS numbers_games (
      nonce TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      board TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    )
  `);

  _tableReady = true;
}

export type NewNumbersGame = {
  nonce: string;
  timestamp: number;
  board: CellValues[];
};

export function createNumbersGame(userId: string): NewNumbersGame {
  ensureTable();

  const nonce = crypto.randomUUID();
  const board = generateBoard();
  const timestamp = Date.now();

  getDb()
    .prepare(
      `INSERT INTO numbers_games (nonce, userId, board, createdAt) VALUES (?, ?, ?, ?)`
    )
    .run(nonce, userId, JSON.stringify(board), timestamp);

  return { nonce, timestamp, board };
}

export type StoredNumbersGame = {
  userId: string;
  board: CellValues[];
  createdAt: number;
};

// Lee y borra el nonce en el mismo paso: solo puede consumirse una vez,
// tanto si la partida resulta válida como si no.
export function consumeNumbersGame(nonce: string): StoredNumbersGame | null {
  ensureTable();

  const row = getDb()
    .prepare(`SELECT userId, board, createdAt FROM numbers_games WHERE nonce = ?`)
    .get(nonce) as { userId: string; board: string; createdAt: number } | undefined;

  if (!row) return null;

  getDb().prepare(`DELETE FROM numbers_games WHERE nonce = ?`).run(nonce);

  if (Date.now() - row.createdAt > NONCE_MAX_AGE_MS) return null;

  return {
    userId: row.userId,
    board: JSON.parse(row.board) as CellValues[],
    createdAt: row.createdAt,
  };
}
