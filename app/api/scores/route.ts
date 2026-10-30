import { requireAuth, type AuthUser } from "@/app/lib/auth";
import {
  getPlayerBestScoreForGame,
  getPlayerBestScores,
  getPlayersBeatenByScore,
  getScoreRank,
  getScoresForGame,
  insertScore,
} from "@/app/lib/scores/db";
import {
  GAME_IDS,
  GAME_NAMES,
  GAME_PATHS,
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
import { consumeWordsGame } from "@/app/lib/words/db";
import { computeWordsScore } from "@/app/lib/words/scoring";
import { replayTetris } from "@/app/lib/tetris/replay";
import { consumeTetrisGame } from "@/app/lib/tetris/db";
import { LINES_TARGET as TETRIS_LINES_TARGET } from "@/app/lib/tetris/engine";
import { consumeChessGame } from "@/app/lib/chess/db";
import { replayChessMoves } from "@/app/lib/chess/replay";
import { formatTimeMs } from "@/app/lib/scores/format";
import { postToGamingApp } from "@/app/lib/nextcloud/gamingApp";
import { NextRequest } from "next/server";
import type { GameId } from "@/app/lib/scores/types";

// Tetris scores in total game ms (lower is better); the rest in points.
// For Nextcloud activity/notifications we want Tetris shown as MM:SS.mmm
// instead of the raw number of milliseconds.
function formatScoreLabel(gameId: GameId, score: number): string {
  return gameId === GAME_IDS.TETRIS ? formatTimeMs(score) : String(score);
}

async function logRejected(what: string, response: Response | null): Promise<void> {
  if (response && !response.ok) {
    console.error(`Nextcloud rejected ${what}:`, response.status, await response.text());
  }
}

async function createActivity(
  request: NextRequest,
  gameId: GameId,
  score: number,
  userId: string
): Promise<void> {
  const cookie = request.headers.get("cookie");
  // userId binds the signature to the session's user (Nextcloud checks it)
  // and path is the deeplink to the game inside the Nextcloud app.
  const common = {
    userId,
    game: GAME_NAMES[gameId],
    score,
    scoreLabel: formatScoreLabel(gameId, score),
    path: GAME_PATHS[gameId],
  };

  try {
    await logRejected("activity", await postToGamingApp("score", common, cookie));
  } catch (err) {
    console.error("Unable to publish Nextcloud activity:", err);
  }

  // Beaten records: any player whose all-time best score in this game falls
  // below (or above, in tetris) the newly achieved score gets an individual
  // notification in Nextcloud — but only if it's a REAL overtake, i.e. if
  // the player didn't already have a previous score that beat that player's
  // (otherwise they would already have been notified back then).
  try {
    const previousBest = await getPlayerBestScoreForGame(userId, gameId);
    const beatenPlayers = await getPlayersBeatenByScore(
      gameId,
      userId,
      score,
      previousBest?.score ?? null
    );

    for (const player of beatenPlayers) {
      const response = await postToGamingApp(
        "notify",
        {
          ...common,
          targetUserId: player.userId,
          previousScore: player.previousBest,
          previousScoreLabel: formatScoreLabel(gameId, player.previousBest),
        },
        cookie
      );
      await logRejected(`notification for ${player.userId}`, response);
    }
  } catch (err) {
    console.error("Unable to send Nextcloud notifications:", err);
  }
}

function errorResponse(error: unknown): Response {
  const body: ScoresErrorResponse = { error: getErrorResponseMessage(error) };
  return Response.json(body, { status: getErrorStatus(error) });
}

// Chess doesn't send a trusted score either: every move was already
// validated one by one against /api/chess (legality via chess.js, AI called
// server-side against Stockfish with the elo stored under the nonce, never
// the client's). Here we only need to replay the move log from scratch and
// check that the game really ended in a win for the player.
//
// The player always plays White (Black is moved by the server itself via
// Stockfish, never by the client). isGameOver() alone is NOT enough: it's
// also true on a draw, stalemate, or when it's the PLAYER who gets
// checkmated — without checking isCheckmate() + which color, any game
// ending (including a self-inflicted loss in a couple of moves) used to
// score just like a real win. A game only scores if, when it ends, it's
// Black's turn to move and Black is checkmated (turn() === "b" &&
// isCheckmate()): that is the only thing that means White (the player)
// delivered mate. Draws don't score.
async function saveChessScore(request: NextRequest, user: AuthUser, params: any): Promise<Response> {
  const { nonce } = params;

  if (typeof nonce !== "string" || nonce.trim() === "") {
    return Response.json({ error: "nonce is required." }, { status: 400 });
  }

  const stored = await consumeChessGame(nonce);
  if (!stored || stored.userId !== user.id) {
    return Response.json(
      { error: "Invalid, expired or already used nonce." },
      { status: 400 }
    );
  }

  const replay = replayChessMoves(stored.moves);
  if (!replay.valid) {
    return Response.json({ error: `Invalid game: ${replay.reason}` }, { status: 400 });
  }
  if (!replay.gameOver) {
    return Response.json({ error: "Game is not complete." }, { status: 400 });
  }
  const playerWon = replay.chess.isCheckmate() && replay.chess.turn() === "b";
  if (!playerWon) {
    return Response.json(
      { error: "Game did not end in a win for the player." },
      { status: 400 }
    );
  }

  const score = stored.elo;
  const serializedConfig = serializeGameConfig({ elo: stored.elo, plies: stored.moves.length });
  if (!serializedConfig.ok) {
    return Response.json({ error: serializedConfig.error }, { status: 400 });
  }

  await createActivity(request, GAME_IDS.CHESS, score, user.id);

  const id = await insertScore(user, GAME_IDS.CHESS, score, serializedConfig.value);
  const { rank, total } = await getScoreRank(GAME_IDS.CHESS, id);

  const body: SaveScoreResponse = {
    message: "Score saved successfully.",
    id,
    score,
    rank,
    total,
  };
  return Response.json(body, { status: 200 });
}

// Numbers doesn't send a trusted score: it sends the game's nonce (issued
// by /api/numbers/new-game), the initial board and the moves made. The
// server replays the game and computes the score itself.
async function saveNumbersScore(request: NextRequest, user: AuthUser, params: any): Promise<Response> {
  const { nonce, board, moves } = params;

  if (typeof nonce !== "string" || nonce.trim() === "") {
    return Response.json({ error: "nonce is required." }, { status: 400 });
  }
  if (!Array.isArray(board)) {
    return Response.json({ error: "board is required." }, { status: 400 });
  }

  const stored = await consumeNumbersGame(nonce);
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

  const elapsed = Date.now() - stored.createdAt;
  const validation = validateMoves(stored.board, moves, elapsed);
  if (!validation.valid) {
    return Response.json(
      { error: `Invalid game: ${validation.reason}` },
      { status: 400 }
    );
  }

  const finalScore = computeNumbersScore(validation.steps, elapsed);
  const serializedConfig = serializeGameConfig({ steps: validation.steps });
  if (!serializedConfig.ok) {
    return Response.json({ error: serializedConfig.error }, { status: 400 });
  }

  await createActivity(request, GAME_IDS.NUMBERS, finalScore, user.id);
  const id = await insertScore(user, GAME_IDS.NUMBERS, finalScore, serializedConfig.value);
  const { rank, total } = await getScoreRank(GAME_IDS.NUMBERS, id);

  const body: SaveScoreResponse = {
    message: "Score saved successfully.",
    id,
    score: finalScore,
    rank,
    total,
  };
  return Response.json(body, { status: 200 });
}

// Words doesn't send a trusted score either: every round was already
// validated one by one against /api/words/answer (single-use). Any game
// that has ended scores, whether all 10 rounds were answered correctly or
// the player missed earlier (stored.ended, set by /api/words/answer) —
// never a half-played game. The score uses the same formula as numbers:
// correct answers cubed over time, computed with the server clock.
async function saveWordsScore(request: NextRequest, user: AuthUser, params: any): Promise<Response> {
  const { nonce } = params;

  if (typeof nonce !== "string" || nonce.trim() === "") {
    return Response.json({ error: "nonce is required." }, { status: 400 });
  }

  const stored = await consumeWordsGame(nonce);
  if (!stored || stored.userId !== user.id) {
    return Response.json(
      { error: "Invalid, expired or already used nonce." },
      { status: 400 }
    );
  }

  if (!stored.ended && stored.answeredCount < stored.rounds.length) {
    return Response.json({ error: "Game is not complete." }, { status: 400 });
  }

  const elapsed = Date.now() - stored.createdAt;
  const finalScore = computeWordsScore(stored.answeredCount, elapsed);
  const serializedConfig = serializeGameConfig({
    wordsTotal: stored.rounds.length,
    correctAnswers: stored.answeredCount,
    timeMs: elapsed,
  });
  if (!serializedConfig.ok) {
    return Response.json({ error: serializedConfig.error }, { status: 400 });
  }

  await createActivity(request, GAME_IDS.WORDS, finalScore, user.id);

  const id = await insertScore(user, GAME_IDS.WORDS, finalScore, serializedConfig.value);
  const { rank, total } = await getScoreRank(GAME_IDS.WORDS, id);

  const body: SaveScoreResponse = {
    message: "Score saved successfully.",
    id,
    score: finalScore,
    rank,
    total,
  };
  return Response.json(body, { status: 200 });
}

// Tetris doesn't send a trusted score either: it sends the nonce (which
// binds the game to a fixed piece seed, issued by /api/tetris/new-game) and
// the action log with timestamps relative to the start. The server replays
// the whole game with the same engine as the client
// (app/lib/tetris/replay.ts) and only if the replay legally reaches
// LINES_TARGET does it compute the final time with its own clock.
async function saveTetrisScore(request: NextRequest, user: AuthUser, params: any): Promise<Response> {
  const { nonce, actions } = params;

  if (typeof nonce !== "string" || nonce.trim() === "") {
    return Response.json({ error: "nonce is required." }, { status: 400 });
  }

  const stored = await consumeTetrisGame(nonce);
  if (!stored || stored.userId !== user.id) {
    return Response.json(
      { error: "Invalid, expired or already used nonce." },
      { status: 400 }
    );
  }

  const replay = replayTetris(stored.seed, actions);
  if (!replay.valid) {
    return Response.json({ error: `Invalid game: ${replay.reason}` }, { status: 400 });
  }

  const elapsed = Date.now() - stored.createdAt;
  const serializedConfig = serializeGameConfig({ linesTarget: TETRIS_LINES_TARGET });
  if (!serializedConfig.ok) {
    return Response.json({ error: serializedConfig.error }, { status: 400 });
  }

  await createActivity(request, GAME_IDS.TETRIS, elapsed, user.id);

  const id = await insertScore(user, GAME_IDS.TETRIS, elapsed, serializedConfig.value);
  const { rank, total } = await getScoreRank(GAME_IDS.TETRIS, id);

  const body: SaveScoreResponse = {
    message: "Score saved successfully.",
    id,
    score: elapsed,
    rank,
    total,
  };
  return Response.json(body, { status: 200 });
}

function toPlayerGameBest(
  gameId: GameId,
  best: Awaited<ReturnType<typeof getPlayerBestScoreForGame>>
): PlayerGameBest {
  return {
    gameId,
    gameName: GAME_NAMES[gameId],
    found: best !== null,
    score: best?.score ?? null,
    rank: best?.rank ?? null,
    total: best?.total ?? null,
    gameConfig: best?.gameConfig ?? null,
    createdAt: best?.createdAt ?? null,
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireAuth(request);

    const params = await request.json();
    const { gameId, score, gameConfig } = params;

    const parsedGameId = parseGameIdBody(gameId);
    if (parsedGameId === null) {
      return Response.json(
        { error: "gameId must be a valid game identifier (1-4)." },
        { status: 400 }
      );
    }

    if (parsedGameId === GAME_IDS.CHESS) {
      return await saveChessScore(request, user, params);
    }
    if (parsedGameId === GAME_IDS.NUMBERS) {
      return await saveNumbersScore(request, user, params);
    }
    if (parsedGameId === GAME_IDS.WORDS) {
      return await saveWordsScore(request, user, params);
    }
    if (parsedGameId === GAME_IDS.TETRIS) {
      return await saveTetrisScore(request, user, params);
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

    const id = await insertScore(user, parsedGameId, parsedScore, serializedConfig.value);
    const { rank, total } = await getScoreRank(parsedGameId, id);

    const body: SaveScoreResponse = {
      message: "Score saved successfully.",
      id,
      score: parsedScore,
      rank,
      total,
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

    // --- "My scores" view: the backend decides who the user is ---
    if (wantsMe) {
      const user = await requireAuth(request);
      const gameIdParam = searchParams.get("gameId");

      if (gameIdParam) {
        const parsedGameId = parseGameIdParam(gameIdParam);
        if (parsedGameId === null) {
          return Response.json(
            { error: "gameId must be a valid game identifier (1-4)." },
            { status: 400 }
          );
        }

        const best = await getPlayerBestScoreForGame(user.id, parsedGameId);
        const body: GetPlayerScoresResponse = {
          username: user.name,
          games: [toPlayerGameBest(parsedGameId, best)],
        };
        return Response.json(body, { status: 200 });
      }

      const results = await getPlayerBestScores(user.id);
      const body: GetPlayerScoresResponse = {
        username: user.name,
        games: results.map((best, i) => toPlayerGameBest((i + 1) as GameId, best)),
      };
      return Response.json(body, { status: 200 });
    }

    // --- Existing view: a game's leaderboard (public) ---
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
      scores: await getScoresForGame(parsedGameId),
    };
    body.total = body.scores.length;

    return Response.json(body, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}