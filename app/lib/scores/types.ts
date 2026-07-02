import { errorMessage } from "@/app/helpers";

export const GAME_IDS = {
  CHESS: 1,
  NUMBERS: 2,
  TETRIS: 3,
  WORDS: 4,
} as const;

export type GameId = (typeof GAME_IDS)[keyof typeof GAME_IDS];

export const VALID_GAME_IDS: readonly GameId[] = Object.values(GAME_IDS);

export type ScoreEntry = {
  username: string;
  userId: string | null;
  score: number;
  gameConfig: Record<string, unknown> | null;
  createdAt: string;
};

export type GetScoresResponse = {
  gameId: GameId;
  total: number;
  scores: ScoreEntry[];
};

export type SaveScoreResponse = {
  message: string;
  id: number;
  score: number;
};

export type ScoresErrorResponse = {
  error: string;
};

const AUTH_ERRORS = new Set([
  "No token",
  "Invalid access token",
  "Failed to refresh access token",
  "Invalid token and no refresh token available",
  "Invalid refreshed token",
]);

export function isValidGameId(value: number): value is GameId {
  return (VALID_GAME_IDS as readonly number[]).includes(value);
}

export function parseGameIdParam(value: string | null): GameId | null {
  if (value === null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || !isValidGameId(parsed)) {
    return null;
  }

  return parsed;
}

export function parseGameIdBody(value: unknown): GameId | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || !isValidGameId(parsed)) {
    return null;
  }

  return parsed;
}

export function parseScoreValue(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.trunc(parsed);
}

export function parseStoredGameConfig(
  stored: string | null
): Record<string, unknown> | null {
  if (!stored) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

export function serializeGameConfig(
  gameConfig: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (gameConfig === undefined || gameConfig === null) {
    return { ok: true, value: null };
  }

  if (typeof gameConfig !== "object" || Array.isArray(gameConfig)) {
    return { ok: false, error: "gameConfig must be a JSON object." };
  }

  try {
    return { ok: true, value: JSON.stringify(gameConfig) };
  } catch {
    return { ok: false, error: "gameConfig is not serializable." };
  }
}

export function getErrorStatus(error: unknown): number {
  if (error instanceof Error && AUTH_ERRORS.has(error.message)) {
    return 401;
  }

  return 500;
}

export function getErrorResponseMessage(error: unknown): string {
  if (error instanceof Error && AUTH_ERRORS.has(error.message)) {
    return error.message;
  }

  return errorMessage(error);
}

// scores/types.ts — AÑADIR

export const GAME_NAMES: Record<GameId, string> = {
  1: "Chess",
  2: "Numbers",
  3: "Tetris",
  4: "Wording",
};

export type PlayerGameBest = {
  gameId: GameId;
  gameName: string;
  found: boolean;
  score: number | null;
  rank: number | null;
  gameConfig: ReturnType<typeof parseStoredGameConfig> | null;
  createdAt: string | null;
};

export type GetPlayerScoresResponse = {
  username: string;
  games: PlayerGameBest[];
};
