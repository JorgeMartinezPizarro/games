import type { AuthUser } from "@/app/lib/auth";
import type { GameId, ScoreEntry } from "@/app/lib/scores/types";
import { parseStoredGameConfig } from "@/app/lib/scores/types";
import mysql from "mysql2/promise";
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;

  _pool = mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: Number(process.env.MARIADB_PORT ?? 3306),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    // Returns DATETIME as a "YYYY-MM-DD HH:MM:SS" string instead of a Date,
    // just like better-sqlite3 did (createdAt is typed as string in
    // app/lib/scores/types.ts and travels unchanged through the API/frontend).
    dateStrings: true,
  });

  return _pool;
}

let _ready: Promise<void> | null = null;

// No migration: the full schema is created in one go (the old SQLite patch
// that added userId with a separate ALTER TABLE isn't needed).
async function ensureSchema(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(191) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      gameId INT NOT NULL,
      userId VARCHAR(191),
      username VARCHAR(255) NOT NULL,
      score INT NOT NULL,
      gameConfig TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_gameId (gameId),
      KEY idx_gameId_score (gameId, score),
      KEY idx_scores_userId (userId)
    )
  `);
}

// mariadb turns "healthy" (depends_on/healthcheck) as soon as it accepts TCP;
// plenty of margin in practice, but a small retry with a delay covers any
// transient hiccup right after a start/restart (e.g. a deployment) without
// the very first real request getting stuck on an error that would have
// resolved itself just a second later.
async function ensureSchemaWithRetry(retries = 6, delayMs = 500): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureSchema();
      return;
    } catch (error) {
      if (attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// Memoizes the initialization promise; if it fails (e.g. MariaDB wasn't
// ready yet), it's cleared so the next call can retry instead of being
// stuck forever with a rejected promise.
export async function getDb(): Promise<Pool> {
  if (!_ready) {
    _ready = ensureSchemaWithRetry().catch((error) => {
      _ready = null;
      throw error;
    });
  }
  await _ready;
  return getPool();
}

type ScoreRow = {
  username: string;
  userId: string | null;
  score: number;
  gameConfig: string | null;
  createdAt: string;
};

type RankedScoreRow = ScoreRow & { userId: string | null; rank: number; total: number };

// "Winning" direction per game: 'desc' = higher score is better (Chess,
// Numbers and Wording: correct answers cubed over time), 'asc' = lower score
// is better (Tetris stores time in ms).
const GAME_DIRECTIONS: Record<GameId, "asc" | "desc"> = {
  1: "desc",
  2: "desc",
  3: "asc",
  4: "desc",
};

const ALL_GAME_IDS: GameId[] = [1, 2, 3, 4];

// `total` (COUNT(*) OVER (), unfiltered) travels in the same row as the
// player's best position: that way "your position: #Z of N" comes from a
// single query, without depending on getScoresForGame's LIMIT 100.
function rankQuery(direction: "ASC" | "DESC"): string {
  return `
    SELECT userId, username, score, gameConfig, createdAt, rank, total FROM (
      SELECT
        s.userId AS userId,
        COALESCE(u.name, s.username) AS username,
        s.score AS score,
        s.gameConfig AS gameConfig,
        s.createdAt AS createdAt,
        ROW_NUMBER() OVER (ORDER BY s.score ${direction}) AS rank,
        COUNT(*) OVER () AS total
      FROM scores s
      LEFT JOIN users u ON s.userId = u.id
      WHERE s.gameId = ?
    ) ranked
    WHERE userId = ?
    ORDER BY rank ASC
    LIMIT 1
  `;
}

function beatenPlayersQuery(aggFn: "MIN" | "MAX", comparator: "<" | ">"): string {
  return `
    SELECT s.userId AS userId, COALESCE(u.name, s.username) AS username, ${aggFn}(s.score) AS bestScore
    FROM scores s
    LEFT JOIN users u ON s.userId = u.id
    WHERE s.gameId = ? AND s.userId IS NOT NULL AND s.userId != ?
    GROUP BY s.userId
    HAVING ${aggFn}(s.score) ${comparator} ?
       AND (? IS NULL OR NOT (${aggFn}(s.score) ${comparator} ?))
  `;
}

export type BeatenPlayer = {
  userId: string;
  username: string;
  previousBest: number;
};

// Beaten records: all-time best score (per user) for each game, compared
// against the score just achieved. The "winning" direction (asc/desc)
// determines whether "beaten" means "less than" (tetris) or "greater than"
// (the rest). It only counts as a REAL overtake if the player didn't
// already have, before this game, a score that beat the other player's —
// if they had already beaten them before, there's no new notification
// every time they improve their own record.
export async function getPlayersBeatenByScore(
  gameId: GameId,
  excludeUserId: string,
  newScore: number,
  previousBest: number | null
): Promise<BeatenPlayer[]> {
  const direction = GAME_DIRECTIONS[gameId];
  const query =
    direction === "asc" ? beatenPlayersQuery("MIN", ">") : beatenPlayersQuery("MAX", "<");

  const db = await getDb();
  const [rows] = await db.execute<RowDataPacket[]>(query, [
    gameId,
    excludeUserId,
    newScore,
    previousBest,
    previousBest,
  ]);

  return (rows as { userId: string; username: string; bestScore: number }[]).map((row) => ({
    userId: row.userId,
    username: row.username,
    previousBest: row.bestScore,
  }));
}

export async function ensureUser(user: AuthUser): Promise<AuthUser> {
  const db = await getDb();
  await db.execute(
    `
      INSERT INTO users (id, name, email, updatedAt)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        email = VALUES(email),
        updatedAt = CURRENT_TIMESTAMP
    `,
    [user.id, user.name, user.email]
  );
  return user;
}

export async function insertScore(
  user: AuthUser,
  gameId: GameId,
  score: number,
  gameConfig: string | null
): Promise<number> {
  await ensureUser(user);

  const db = await getDb();
  const [result] = await db.execute<ResultSetHeader>(
    `
      INSERT INTO scores (gameId, userId, username, score, gameConfig)
      VALUES (?, ?, ?, ?, ?)
    `,
    [gameId, user.id, user.name, score, gameConfig]
  );

  return result.insertId;
}

export type ScoreRank = { rank: number; total: number };

function scoreRankByIdQuery(direction: "ASC" | "DESC"): string {
  return `
    SELECT rank, total FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY score ${direction}) AS rank,
        COUNT(*) OVER () AS total
      FROM scores
      WHERE gameId = ?
    ) ranked
    WHERE id = ?
  `;
}

// Position of ONE specific game (by id, not "your all-time best") within
// that game's full ranking: the result achieved in THAT round, even if the
// player already had a better position stored from before.
export async function getScoreRank(gameId: GameId, scoreId: number): Promise<ScoreRank> {
  const direction = GAME_DIRECTIONS[gameId] === "asc" ? "ASC" : "DESC";
  const db = await getDb();
  const [rows] = await db.execute<RowDataPacket[]>(scoreRankByIdQuery(direction), [
    gameId,
    scoreId,
  ]);
  const row = (rows as ScoreRank[])[0];
  if (!row) {
    throw new Error(`Score ${scoreId} not found for gameId ${gameId} when computing rank.`);
  }
  return row;
}

export async function getScoresForGame(gameId: GameId): Promise<ScoreEntry[]> {
  // The "winning" direction depends on the game (see GAME_DIRECTIONS): in
  // most, a higher score is better, but tetris stores time in ms (lower is
  // better). This used to always sort DESC, so in tetris the LIMIT 100 kept
  // the 100 SLOWEST games and could leave the best times out of the ranking
  // (and out of any position calculation) as soon as more than 100 games
  // were stored.
  const direction = GAME_DIRECTIONS[gameId] === "asc" ? "ASC" : "DESC";
  const db = await getDb();
  const [rows] = await db.execute<RowDataPacket[]>(
    `
      SELECT COALESCE(u.name, s.username) AS username, s.userId, s.score, s.gameConfig, s.createdAt
      FROM scores s
      LEFT JOIN users u ON s.userId = u.id
      WHERE s.gameId = ?
      ORDER BY s.score ${direction}
      LIMIT 100
    `,
    [gameId]
  );

  return (rows as ScoreRow[]).map((row) => ({
    username: row.username,
    userId: row.userId,
    score: row.score,
    gameConfig: parseStoredGameConfig(row.gameConfig),
    createdAt: row.createdAt,
  }));
}

export type PlayerBestScore = {
  gameId: GameId;
  username: string;
  score: number;
  gameConfig: ReturnType<typeof parseStoredGameConfig>;
  createdAt: string;
  rank: number;
  total: number;
};

export async function getPlayerBestScoreForGame(
  userId: string,
  gameId: GameId
): Promise<PlayerBestScore | null> {
  const direction = GAME_DIRECTIONS[gameId];
  const query = direction === "asc" ? rankQuery("ASC") : rankQuery("DESC");

  const db = await getDb();
  const [rows] = await db.execute<RowDataPacket[]>(query, [gameId, userId]);
  const row = (rows as RankedScoreRow[])[0];
  if (!row) return null;

  return {
    gameId,
    username: row.username,
    score: row.score,
    gameConfig: parseStoredGameConfig(row.gameConfig),
    createdAt: row.createdAt,
    rank: row.rank,
    total: row.total,
  };
}

export async function getPlayerBestScores(
  userId: string
): Promise<(PlayerBestScore | null)[]> {
  return Promise.all(ALL_GAME_IDS.map((gameId) => getPlayerBestScoreForGame(userId, gameId)));
}
