import { getDb } from "@/app/lib/scores/db";
import { randomSeed } from "@/app/lib/tetris/rng";
import crypto from "node:crypto";

// Nonces caducan a los 30 minutos: una partida de tetris puede alargarse
// bastante más que numbers/words si al jugador le cuesta llegar a las 25
// líneas.
const NONCE_MAX_AGE_MS = 30 * 60 * 1000;

let _tableReady = false;

function ensureTable(): void {
  if (_tableReady) return;

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS tetris_games (
      nonce TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      seed INTEGER NOT NULL,
      createdAt INTEGER NOT NULL
    )
  `);

  _tableReady = true;
}

export type NewTetrisGame = {
  nonce: string;
  timestamp: number;
  seed: number;
};

export function createTetrisGame(userId: string): NewTetrisGame {
  ensureTable();

  const nonce = crypto.randomUUID();
  const seed = randomSeed();
  const timestamp = Date.now();

  getDb()
    .prepare(`INSERT INTO tetris_games (nonce, userId, seed, createdAt) VALUES (?, ?, ?, ?)`)
    .run(nonce, userId, seed, timestamp);

  return { nonce, timestamp, seed };
}

export type StoredTetrisGame = {
  userId: string;
  seed: number;
  createdAt: number;
};

// Lectura + borrado en un solo paso: el nonce solo puede usarse una vez,
// tanto si la partida resulta válida como si no.
export function consumeTetrisGame(nonce: string): StoredTetrisGame | null {
  ensureTable();

  const row = getDb()
    .prepare(`SELECT userId, seed, createdAt FROM tetris_games WHERE nonce = ?`)
    .get(nonce) as { userId: string; seed: number; createdAt: number } | undefined;

  if (!row) return null;

  getDb().prepare(`DELETE FROM tetris_games WHERE nonce = ?`).run(nonce);

  if (Date.now() - row.createdAt > NONCE_MAX_AGE_MS) return null;

  return { userId: row.userId, seed: row.seed, createdAt: row.createdAt };
}
