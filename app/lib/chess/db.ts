import { getDb } from "@/app/lib/scores/db";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import crypto from "node:crypto";

// Nonces expire after 60 minutes: unlike numbers/words/tetris, a chess
// game includes the player's thinking time on every move, not just an
// automated action log.
const NONCE_MAX_AGE_MS = 60 * 60 * 1000;

const MIN_ELO = 400;
const MAX_ELO = 3000;

let _tableReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (_tableReady) return _tableReady;

  _tableReady = (async () => {
    const db = await getDb();
    await db.query(`
      CREATE TABLE IF NOT EXISTS game_chess (
        nonce VARCHAR(191) PRIMARY KEY,
        userId VARCHAR(191) NOT NULL,
        elo INT NOT NULL,
        moves TEXT NOT NULL,
        createdAt BIGINT NOT NULL
      )
    `);
  })().catch((error) => {
    _tableReady = null;
    throw error;
  });

  return _tableReady;
}

export type NewChessGame = {
  nonce: string;
  timestamp: number;
};

export async function createChessGame(userId: string, elo: number): Promise<NewChessGame> {
  await ensureTable();

  if (!Number.isInteger(elo) || elo < MIN_ELO || elo > MAX_ELO) {
    throw new Error(`elo must be an integer between ${MIN_ELO} and ${MAX_ELO}.`);
  }

  const nonce = crypto.randomUUID();
  const timestamp = Date.now();

  const db = await getDb();
  await db.execute(
    `INSERT INTO game_chess (nonce, userId, elo, moves, createdAt) VALUES (?, ?, ?, '[]', ?)`,
    [nonce, userId, elo, timestamp]
  );

  return { nonce, timestamp };
}

export type ChessGameState = {
  userId: string;
  elo: number;
  moves: string[];
  movesJson: string;
  createdAt: number;
};

export async function deleteChessGame(nonce: string): Promise<void> {
  await ensureTable();
  const db = await getDb();
  await db.execute(`DELETE FROM game_chess WHERE nonce = ?`, [nonce]);
}

export async function getChessGame(nonce: string): Promise<ChessGameState | null> {
  await ensureTable();

  const db = await getDb();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT userId, elo, moves, createdAt FROM game_chess WHERE nonce = ?`,
    [nonce]
  );
  const row = (rows as { userId: string; elo: number; moves: string; createdAt: number }[])[0];

  if (!row) return null;

  if (Date.now() - row.createdAt > NONCE_MAX_AGE_MS) {
    await deleteChessGame(nonce);
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

// Compare-and-swap append: only writes if the contents of `moves` match
// exactly what was read (expectedMovesJson). Unlike numbers/words/tetris,
// here there is a network await (Stockfish) between the player's move and
// the AI's move within the same request — without this, two concurrent
// requests for the same nonce could overwrite each other.
export async function appendChessMove(
  nonce: string,
  expectedMovesJson: string,
  uciMove: string
): Promise<boolean> {
  await ensureTable();

  const moves = JSON.parse(expectedMovesJson) as string[];
  moves.push(uciMove);

  const db = await getDb();
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE game_chess SET moves = ? WHERE nonce = ? AND moves = ?`,
    [JSON.stringify(moves), nonce, expectedMovesJson]
  );

  return result.affectedRows === 1;
}

// Read + delete in one step: can only be used once to save the final
// score, whether or not the game was complete. The DELETE checks
// affectedRows instead of assuming success: if two concurrent requests read
// the same nonce before either one deletes it, without this both would see
// the game as valid and score the same game twice — only the one that
// actually deletes the row (affectedRows === 1) goes ahead.
export async function consumeChessGame(nonce: string): Promise<ChessGameState | null> {
  const game = await getChessGame(nonce);
  if (!game) return null;

  const db = await getDb();
  const [result] = await db.execute<ResultSetHeader>(
    `DELETE FROM game_chess WHERE nonce = ?`,
    [nonce]
  );
  if (result.affectedRows !== 1) return null;

  return game;
}
