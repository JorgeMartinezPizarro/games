import { getDb } from "@/app/lib/scores/db";
import { randomSeed } from "@/app/lib/tetris/rng";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import crypto from "node:crypto";

// Nonces expire after 30 minutes: a tetris game can run quite a bit longer
// than numbers/words if the player struggles to reach the 25 lines.
const NONCE_MAX_AGE_MS = 30 * 60 * 1000;

let _tableReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (_tableReady) return _tableReady;

  _tableReady = (async () => {
    const db = await getDb();
    await db.query(`
      CREATE TABLE IF NOT EXISTS tetris_games (
        nonce VARCHAR(191) PRIMARY KEY,
        userId VARCHAR(191) NOT NULL,
        seed BIGINT NOT NULL,
        createdAt BIGINT NOT NULL
      )
    `);
  })().catch((error) => {
    _tableReady = null;
    throw error;
  });

  return _tableReady;
}

export type NewTetrisGame = {
  nonce: string;
  timestamp: number;
  seed: number;
};

export async function createTetrisGame(userId: string): Promise<NewTetrisGame> {
  await ensureTable();

  const nonce = crypto.randomUUID();
  const seed = randomSeed();
  const timestamp = Date.now();

  const db = await getDb();
  await db.execute(
    `INSERT INTO tetris_games (nonce, userId, seed, createdAt) VALUES (?, ?, ?, ?)`,
    [nonce, userId, seed, timestamp]
  );

  return { nonce, timestamp, seed };
}

export type StoredTetrisGame = {
  userId: string;
  seed: number;
  createdAt: number;
};

// Read + delete in a single step: the nonce can only be used once, whether
// or not the game turns out to be valid. The DELETE checks affectedRows
// instead of assuming success: if two concurrent requests read the same
// nonce before either one deletes it, without this both would see the row
// and score the same game twice — only the one that actually deletes the
// row (affectedRows === 1) goes ahead.
export async function consumeTetrisGame(nonce: string): Promise<StoredTetrisGame | null> {
  await ensureTable();

  const db = await getDb();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT userId, seed, createdAt FROM tetris_games WHERE nonce = ?`,
    [nonce]
  );
  const row = (rows as { userId: string; seed: number; createdAt: number }[])[0];

  if (!row) return null;

  const [result] = await db.execute<ResultSetHeader>(
    `DELETE FROM tetris_games WHERE nonce = ?`,
    [nonce]
  );
  if (result.affectedRows !== 1) return null;

  if (Date.now() - row.createdAt > NONCE_MAX_AGE_MS) return null;

  return { userId: row.userId, seed: row.seed, createdAt: row.createdAt };
}
