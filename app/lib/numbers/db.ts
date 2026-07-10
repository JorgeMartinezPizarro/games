import { getDb } from "@/app/lib/scores/db";
import { generateBoard } from "@/app/lib/numbers/board";
import type { CellValues } from "@/app/types";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import crypto from "node:crypto";

// Nonces caducan a los 15 minutos: tiempo de sobra para jugar una partida,
// evita que se acumulen filas huérfanas si nunca se envía el score.
const NONCE_MAX_AGE_MS = 15 * 60 * 1000;

let _tableReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (_tableReady) return _tableReady;

  _tableReady = (async () => {
    const db = await getDb();
    await db.query(`
      CREATE TABLE IF NOT EXISTS numbers_games (
        nonce VARCHAR(191) PRIMARY KEY,
        userId VARCHAR(191) NOT NULL,
        board TEXT NOT NULL,
        createdAt BIGINT NOT NULL
      )
    `);
  })().catch((error) => {
    _tableReady = null;
    throw error;
  });

  return _tableReady;
}

export type NewNumbersGame = {
  nonce: string;
  timestamp: number;
  board: CellValues[];
};

export async function createNumbersGame(userId: string): Promise<NewNumbersGame> {
  await ensureTable();

  const nonce = crypto.randomUUID();
  const board = generateBoard();
  const timestamp = Date.now();

  const db = await getDb();
  await db.execute(
    `INSERT INTO numbers_games (nonce, userId, board, createdAt) VALUES (?, ?, ?, ?)`,
    [nonce, userId, JSON.stringify(board), timestamp]
  );

  return { nonce, timestamp, board };
}

export type StoredNumbersGame = {
  userId: string;
  board: CellValues[];
  createdAt: number;
};

// Lee y borra el nonce en el mismo paso: solo puede consumirse una vez,
// tanto si la partida resulta válida como si no. El DELETE comprueba
// affectedRows en vez de asumir éxito: si dos peticiones concurrentes leen
// el mismo nonce antes de que ninguna borre, ambas verían la fila y
// puntuarían la misma partida dos veces sin esto — solo la que de verdad
// borra la fila (affectedRows === 1) sigue adelante.
export async function consumeNumbersGame(nonce: string): Promise<StoredNumbersGame | null> {
  await ensureTable();

  const db = await getDb();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT userId, board, createdAt FROM numbers_games WHERE nonce = ?`,
    [nonce]
  );
  const row = (rows as { userId: string; board: string; createdAt: number }[])[0];

  if (!row) return null;

  const [result] = await db.execute<ResultSetHeader>(
    `DELETE FROM numbers_games WHERE nonce = ?`,
    [nonce]
  );
  if (result.affectedRows !== 1) return null;

  if (Date.now() - row.createdAt > NONCE_MAX_AGE_MS) return null;

  return {
    userId: row.userId,
    board: JSON.parse(row.board) as CellValues[],
    createdAt: row.createdAt,
  };
}
