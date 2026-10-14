import { getDb } from "@/app/lib/scores/db";
import {
  fetchChallenge,
  stripTargets,
  type PublicWordsRound,
  type WordsRound,
} from "@/app/lib/words/challenge";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import crypto from "node:crypto";

// Nonces expire after 15 minutes, same as in numbers: plenty of time to
// play a game, and it avoids orphan rows if the game is never finished.
const NONCE_MAX_AGE_MS = 15 * 60 * 1000;

let _tableReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (_tableReady) return _tableReady;

  _tableReady = (async () => {
    const db = await getDb();
    await db.query(`
      CREATE TABLE IF NOT EXISTS words_games (
        nonce VARCHAR(191) PRIMARY KEY,
        userId VARCHAR(191) NOT NULL,
        rounds TEXT NOT NULL,
        answeredCount INT NOT NULL DEFAULT 0,
        ended TINYINT NOT NULL DEFAULT 0,
        createdAt BIGINT NOT NULL
      )
    `);
  })().catch((error) => {
    _tableReady = null;
    throw error;
  });

  return _tableReady;
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
  await ensureTable();

  const fullRounds = await fetchChallenge(rounds, choices);
  const nonce = crypto.randomUUID();
  const timestamp = Date.now();

  const db = await getDb();
  await db.execute(
    `INSERT INTO words_games (nonce, userId, rounds, answeredCount, createdAt) VALUES (?, ?, ?, 0, ?)`,
    [nonce, userId, JSON.stringify(fullRounds), timestamp]
  );

  return { nonce, timestamp, rounds: stripTargets(fullRounds) };
}

export type WordsGameState = {
  userId: string;
  rounds: WordsRound[];
  answeredCount: number;
  ended: boolean;
  createdAt: number;
};

export async function deleteWordsGame(nonce: string): Promise<void> {
  await ensureTable();
  const db = await getDb();
  await db.execute(`DELETE FROM words_games WHERE nonce = ?`, [nonce]);
}

// Called when a round is failed: unlike an invalid round skip, here the
// game is NOT deleted, so /api/scores can score the correct answers
// achieved up to this point. The nonce becomes unusable for further
// answers (see /api/words/answer).
export async function markWordsGameEnded(nonce: string): Promise<void> {
  await ensureTable();
  const db = await getDb();
  await db.execute(`UPDATE words_games SET ended = 1 WHERE nonce = ?`, [nonce]);
}

export async function getWordsGame(nonce: string): Promise<WordsGameState | null> {
  await ensureTable();

  const db = await getDb();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT userId, rounds, answeredCount, ended, createdAt FROM words_games WHERE nonce = ?`,
    [nonce]
  );
  const row = (
    rows as { userId: string; rounds: string; answeredCount: number; ended: number; createdAt: number }[]
  )[0];

  if (!row) return null;

  if (Date.now() - row.createdAt > NONCE_MAX_AGE_MS) {
    await deleteWordsGame(nonce);
    return null;
  }

  return {
    userId: row.userId,
    rounds: JSON.parse(row.rounds) as WordsRound[],
    answeredCount: row.answeredCount,
    ended: row.ended === 1,
    createdAt: row.createdAt,
  };
}

// Called after validating a correct answer: advances the expected round.
// Returns the new total of correctly answered rounds.
export async function advanceWordsGame(nonce: string): Promise<number> {
  await ensureTable();

  const db = await getDb();
  await db.execute(`UPDATE words_games SET answeredCount = answeredCount + 1 WHERE nonce = ?`, [
    nonce,
  ]);

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT answeredCount FROM words_games WHERE nonce = ?`,
    [nonce]
  );
  const row = (rows as { answeredCount: number }[])[0];

  return row?.answeredCount ?? 0;
}

// Read + delete in one step: can only be used once to save the final
// score, whether or not the game was complete. The DELETE checks
// affectedRows instead of assuming success: if two concurrent requests read
// the same nonce before either one deletes it, without this both would see
// the game as valid and score the same game twice — only the one that
// actually deletes the row (affectedRows === 1) goes ahead.
export async function consumeWordsGame(nonce: string): Promise<WordsGameState | null> {
  const game = await getWordsGame(nonce);
  if (!game) return null;

  const db = await getDb();
  const [result] = await db.execute<ResultSetHeader>(
    `DELETE FROM words_games WHERE nonce = ?`,
    [nonce]
  );
  if (result.affectedRows !== 1) return null;

  return game;
}
