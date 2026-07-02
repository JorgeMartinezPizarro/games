import { getCurrentUser, requireAuth, type AuthUser } from "@/app/lib/auth";
import {
  getPlayerBestScoreForGame,
  getPlayerBestScores,
  getScoresForGame,
  insertScore,
} from "@/app/lib/scores/db";
import {
  GAME_IDS,
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
import { boardsMatch, computeNumbersScore, validateMoves } from "@/app/lib/numbers/board";
import { consumeNumbersGame } from "@/app/lib/numbers/db";
import { NextRequest } from "next/server";
import type { GameId } from "@/app/lib/scores/types";

function errorResponse(error: unknown): Response {
  const body: ScoresErrorResponse = { error: getErrorResponseMessage(error) };
  return Response.json(body, { status: getErrorStatus(error) });
}

// Numbers no manda un score de confianza: manda el nonce de la partida
// (emitido por /api/numbers/new-game), el tablero inicial y los movimientos
// realizados. El servidor reproduce la partida y calcula el score él mismo.
function saveNumbersScore(user: AuthUser, params: any): Response {
  const { nonce, board, moves } = params;

  if (typeof nonce !== "string" || nonce.trim() === "") {
    return Response.json({ error: "nonce is required." }, { status: 400 });
  }
  if (!Array.isArray(board)) {
    return Response.json({ error: "board is required." }, { status: 400 });
  }

  const stored = consumeNumbersGame(nonce);
  if (!stored || stored.userId !== user.id) {
    return Response.json(
      { error: "Invalid, expired or already used nonce." },
      { status: 400 }
    );
  }

  if (!boardsMatch(stored.board, board)) {
    return Response.json(
      { error: "Board does not match the nonce." },
      { status: 400 }
    );
  }

  const validation = validateMoves(stored.board, moves);
  if (!validation.valid) {
    return Response.json(
      { error: `Invalid game: ${validation.reason}` },
      { status: 400 }
    );
  }

  const elapsed = Date.now() - stored.createdAt;
  const finalScore = computeNumbersScore(validation.steps, elapsed);
  const serializedConfig = serializeGameConfig({ steps: validation.steps });
  if (!serializedConfig.ok) {
    return Response.json({ error: serializedConfig.error }, { status: 400 });
  }

  const id = insertScore(user, GAME_IDS.NUMBERS, finalScore, serializedConfig.value);

  const body: SaveScoreResponse = {
    message: "Score saved successfully.",
    id,
    score: finalScore,
  };
  return Response.json(body, { status: 200 });
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

    if (parsedGameId === GAME_IDS.NUMBERS) {
      return saveNumbersScore(user, params);
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
      score: parsedScore,
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

        const best = getPlayerBestScoreForGame(user.id, parsedGameId);
        const body: GetPlayerScoresResponse = {
          username: user.name,
          games: [toPlayerGameBest(parsedGameId, best)],
        };
        return Response.json(body, { status: 200 });
      }

      const results = getPlayerBestScores(user.id);
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