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
    // Devuelve DATETIME como string "YYYY-MM-DD HH:MM:SS" en vez de Date,
    // igual que hacía better-sqlite3 (createdAt se tipa como string en
    // app/lib/scores/types.ts y así viaja igual por la API/frontend).
    dateStrings: true,
  });

  return _pool;
}

let _ready: Promise<void> | null = null;

// Sin migración: el esquema completo se crea de una vez (no hace falta el
// parche histórico de SQLite que añadía userId con un ALTER TABLE aparte).
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

// mariadb pasa a "healthy" (depends_on/healthcheck) en cuanto acepta TCP;
// margen de sobra en la práctica, pero un pequeño reintento con espera cubre
// cualquier hipo transitorio justo tras un arranque/reinicio (p.ej. un
// despliegue) sin que la primerísima petición real se quede colgada de un
// error que se habría resuelto solo un segundo después.
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

// Memoiza la promesa de inicialización; si falla (p.ej. MariaDB no estaba
// aún lista), se limpia para que la siguiente llamada pueda reintentar en
// vez de quedar bloqueada para siempre con una promesa rechazada.
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

// Dirección "ganadora" por juego: 'desc' = mayor score es mejor (Chess,
// Numbers y Wording: cubo de aciertos entre tiempo), 'asc' = menor score es
// mejor (Tetris guarda tiempo en ms).
const GAME_DIRECTIONS: Record<GameId, "asc" | "desc"> = {
  1: "desc",
  2: "desc",
  3: "asc",
  4: "desc",
};

const ALL_GAME_IDS: GameId[] = [1, 2, 3, 4];

// `total` (COUNT(*) OVER (), sin filtrar) viaja en la misma fila que el
// mejor puesto del jugador: así "tu posición: #Z de N" sale de una sola
// consulta, sin depender del LIMIT 100 de getScoresForGame.
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

// Récords batidos: mejor score histórico (por usuario) de cada juego,
// comparado contra el score que se acaba de conseguir. La dirección
// "ganadora" (asc/desc) determina si "batido" significa "menor que" (tetris)
// o "mayor que" (el resto). Solo cuenta como adelantamiento REAL si el
// jugador no tenía ya, antes de esta partida, un score que batiera al del
// otro jugador — si ya le había ganado antes, no se vuelve a notificar cada
// vez que mejora su propio récord.
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

// Posición de UNA partida concreta (por id, no "tu mejor histórico") dentro
// del ranking completo de ese juego: el resultado conseguido en ESA ronda,
// aunque el jugador ya tuviera un puesto mejor guardado de antes.
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
  // La dirección "ganadora" depende del juego (ver GAME_DIRECTIONS): en la
  // mayoría mayor score es mejor, pero tetris guarda tiempo en ms (menor es
  // mejor). Antes esto siempre ordenaba DESC, así que en tetris el LIMIT 100
  // se quedaba con las 100 partidas MÁS LENTAS y podía dejar fuera del
  // ranking (y de cualquier cálculo de posición) los mejores tiempos en
  // cuanto hubiera más de 100 partidas guardadas.
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
