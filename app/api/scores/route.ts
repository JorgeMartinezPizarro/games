import { requireAuth, type AuthUser } from "@/app/lib/auth";
import {
  getPlayerBestScoreForGame,
  getPlayerBestScores,
  getScoresForGame,
  insertScore,
} from "@/app/lib/scores/db";
import {
  GAME_NAMES,
  GetPlayerScoresResponse,
  GetScoresResponse,
  PlayerGameBest,
  SaveScoreResponse,
  ScoresErrorResponse,
  getErrorResponseMessage,
  getErrorStatus,
  parseGameIdBody,
  parseGameIdParam,
  parseScoreValue,
  serializeGameConfig,
} from "@/app/lib/scores/types";
import { NextRequest } from "next/server";
import type { GameId } from "@/app/lib/scores/types";

function errorResponse(error: unknown): Response {
  const body: ScoresErrorResponse = { error: getErrorResponseMessage(error) };
  return Response.json(body, { status: getErrorStatus(error) });
}

// Misma lógica de resolución de usuario que ya usaba el POST,
// centralizada para reutilizarla también en el GET (?me=true).
async function getCurrentUser(request: NextRequest): Promise<AuthUser> {
  if (process.env.NEXT_PUBLIC_ENABLE_LOGIN === "true") {
    return requireAuth(request);
  }
  return { id: "anonymous", name: "anonymous", email: "" };
}

function toPlayerGameBest(
  gameId: GameId,
  best: ReturnType<typeof getPlayerBestScoreForGame>
): PlayerGameBest {
  return {
    gameId,
    gameName: GAME_NAMES[gameId],
    found: best !== null,
    score: best?.score ?? null,
    rank: best?.rank ?? null,
    gameConfig: best?.gameConfig ?? null,
    createdAt: best?.createdAt ?? null,
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await getCurrentUser(request);

    const params = await request.json();
    const { gameId, score, gameConfig } = params;

    const parsedGameId = parseGameIdBody(gameId);
    if (parsedGameId === null) {
      return Response.json(
        { error: "gameId must be a valid game identifier (1-4)." },
        { status: 400 }
      );
    }

    const parsedScore = parseScoreValue(score);
    if (parsedScore === null) {
      return Response.json(
        { error: "score is required and must be a number." },
        { status: 400 }
      );
    }

    const serializedConfig = serializeGameConfig(gameConfig);
    if (!serializedConfig.ok) {
      return Response.json({ error: serializedConfig.error }, { status: 400 });
    }

    const id = insertScore(user, parsedGameId, parsedScore, serializedConfig.value);

    const body: SaveScoreResponse = {
      message: "Score saved successfully.",
      id,
    };

    return Response.json(body, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const wantsMe = searchParams.get("me") === "true";

    // --- Vista "mis scores": el backend decide quién es el usuario ---
    if (wantsMe) {
      const user = await getCurrentUser(request);
      const gameIdParam = searchParams.get("gameId");

      if (gameIdParam) {
        const parsedGameId = parseGameIdParam(gameIdParam);
        if (parsedGameId === null) {
          return Response.json(
            { error: "gameId must be a valid game identifier (1-4)." },
            { status: 400 }
          );
        }

        const best = getPlayerBestScoreForGame(user.name, parsedGameId);
        const body: GetPlayerScoresResponse = {
          username: user.name,
          games: [toPlayerGameBest(parsedGameId, best)],
        };
        return Response.json(body, { status: 200 });
      }

      const results = getPlayerBestScores(user.name);
      const body: GetPlayerScoresResponse = {
        username: user.name,
        games: results.map((best, i) => toPlayerGameBest((i + 1) as GameId, best)),
      };
      return Response.json(body, { status: 200 });
    }

    // --- Vista existente: leaderboard de un juego (pública) ---
    if (process.env.NEXT_PUBLIC_ENABLE_LOGIN === "true")
      await requireAuth(request);

    const parsedGameId = parseGameIdParam(searchParams.get("gameId"));
    if (parsedGameId === null) {
      return Response.json(
        { error: "gameId is required and must be a valid game identifier (1-4)." },
        { status: 400 }
      );
    }

    const body: GetScoresResponse = {
      gameId: parsedGameId,
      total: 0,
      scores: getScoresForGame(parsedGameId),
    };
    body.total = body.scores.length;

    return Response.json(body, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}