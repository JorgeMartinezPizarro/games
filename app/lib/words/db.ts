import { getDb } from "@/app/lib/scores/db";
import {
  fetchChallenge,
  stripTargets,
  type PublicWordsRound,
  type WordsRound,
} from "@/app/lib/words/challenge";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import crypto from "node:crypto";

// Nonces caducan a los 15 minutos, igual que en numbers: tiempo de sobra
// para jugar una partida, evita filas huérfanas si nunca se termina.
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

// Se llama al fallar una ronda: a diferencia de un salto de ronda inválido,
// aquí NO se borra la partida, para que /api/scores pueda puntuar los
// aciertos logrados hasta este punto. El nonce queda inutilizable para
// más respuestas (ver /api/words/answer).
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

// Se llama tras validar una respuesta correcta: avanza la ronda esperada.
// Devuelve el nuevo total de rondas acertadas.
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

// Lectura + borrado en un paso: solo puede usarse una vez para guardar el
// score final, tanto si la partida estaba completa como si no. El DELETE
// comprueba affectedRows en vez de asumir éxito: si dos peticiones
// concurrentes leen el mismo nonce antes de que ninguna borre, ambas verían
// la partida como válida y puntuarían dos veces la misma partida sin esto —
// solo la que de verdad borra la fila (affectedRows === 1) sigue adelante.
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
