import { getDb } from "@/app/lib/scores/db";
import {
  fetchChallenge,
  stripTargets,
  type PublicWordsRound,
  type WordsRound,
} from "@/app/lib/words/challenge";
import crypto from "node:crypto";

// Nonces caducan a los 15 minutos, igual que en numbers: tiempo de sobra
// para jugar una partida, evita filas huérfanas si nunca se termina.
const NONCE_MAX_AGE_MS = 15 * 60 * 1000;

let _tableReady = false;

function ensureTable(): void {
  if (_tableReady) return;

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS words_games (
      nonce TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      rounds TEXT NOT NULL,
      answeredCount INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    )
  `);

  _tableReady = true;
}

export type NewWordsGame = {
  nonce: string;
  timestamp: number;
  rounds: PublicWordsRound[];
};

export async function createWordsGame(
  userId: string,
  rounds: number,
  choices: number
): Promise<NewWordsGame> {
  ensureTable();

  const fullRounds = await fetchChallenge(rounds, choices);
  const nonce = crypto.randomUUID();
  const timestamp = Date.now();

  getDb()
    .prepare(
      `INSERT INTO words_games (nonce, userId, rounds, answeredCount, createdAt) VALUES (?, ?, ?, 0, ?)`
    )
    .run(nonce, userId, JSON.stringify(fullRounds), timestamp);

  return { nonce, timestamp, rounds: stripTargets(fullRounds) };
}

export type WordsGameState = {
  userId: string;
  rounds: WordsRound[];
  answeredCount: number;
  createdAt: number;
};

export function deleteWordsGame(nonce: string): void {
  ensureTable();
  getDb().prepare(`DELETE FROM words_games WHERE nonce = ?`).run(nonce);
}

export function getWordsGame(nonce: string): WordsGameState | null {
  ensureTable();

  const row = getDb()
    .prepare(
      `SELECT userId, rounds, answeredCount, createdAt FROM words_games WHERE nonce = ?`
    )
    .get(nonce) as
    | { userId: string; rounds: string; answeredCount: number; createdAt: number }
    | undefined;

  if (!row) return null;

  if (Date.now() - row.createdAt > NONCE_MAX_AGE_MS) {
    deleteWordsGame(nonce);
    return null;
  }

  return {
    userId: row.userId,
    rounds: JSON.parse(row.rounds) as WordsRound[],
    answeredCount: row.answeredCount,
    createdAt: row.createdAt,
  };
}

// Se llama tras validar una respuesta correcta: avanza la ronda esperada.
// Devuelve el nuevo total de rondas acertadas.
export function advanceWordsGame(nonce: string): number {
  ensureTable();

  getDb()
    .prepare(`UPDATE words_games SET answeredCount = answeredCount + 1 WHERE nonce = ?`)
    .run(nonce);

  const row = getDb()
    .prepare(`SELECT answeredCount FROM words_games WHERE nonce = ?`)
    .get(nonce) as { answeredCount: number } | undefined;

  return row?.answeredCount ?? 0;
}

// Lectura + borrado en un paso: solo puede usarse una vez para guardar el
// score final, tanto si la partida estaba completa como si no.
export function consumeWordsGame(nonce: string): WordsGameState | null {
  const game = getWordsGame(nonce);
  if (!game) return null;
  deleteWordsGame(nonce);
  return game;
}
