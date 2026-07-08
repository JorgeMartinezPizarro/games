import { getDb } from "@/app/lib/scores/db";
import { randomSeed } from "@/app/lib/tetris/rng";
import type { RowDataPacket } from "mysql2/promise";
import crypto from "node:crypto";

// Nonces caducan a los 30 minutos: una partida de tetris puede alargarse
// bastante más que numbers/words si al jugador le cuesta llegar a las 25
// líneas.
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

// Lectura + borrado en un solo paso: el nonce solo puede usarse una vez,
// tanto si la partida resulta válida como si no.
export async function consumeTetrisGame(nonce: string): Promise<StoredTetrisGame | null> {
  await ensureTable();

  const db = await getDb();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT userId, seed, createdAt FROM tetris_games WHERE nonce = ?`,
    [nonce]
  );
  const row = (rows as { userId: string; seed: number; createdAt: number }[])[0];

  if (!row) return null;

  await db.execute(`DELETE FROM tetris_games WHERE nonce = ?`, [nonce]);

  if (Date.now() - row.createdAt > NONCE_MAX_AGE_MS) return null;

  return { userId: row.userId, seed: row.seed, createdAt: row.createdAt };
}
