import { getDb } from "@/app/lib/scores/db";
import { generateBoard } from "@/app/lib/numbers/board";
import type { CellValues } from "@/app/types";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import crypto from "node:crypto";

// Nonces expire after 15 minutes: plenty of time to play a game, and it
// keeps orphan rows from piling up if the score is never submitted.
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

// Reads and deletes the nonce in the same step: it can only be consumed
// once, whether or not the game turns out to be valid. The DELETE checks
// affectedRows instead of assuming success: if two concurrent requests read
// the same nonce before either one deletes it, without this both would see
// the row and score the same game twice — only the one that actually
// deletes the row (affectedRows === 1) goes ahead.
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
