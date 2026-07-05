import { requireAuth, type AuthUser } from "@/app/lib/auth";
import {
  getPlayerBestScoreForGame,
  getPlayerBestScores,
  getPlayersBeatenByScore,
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
import { consumeWordsGame } from "@/app/lib/words/db";
import { computeWordsScore } from "@/app/lib/words/scoring";
import { replayTetris } from "@/app/lib/tetris/replay";
import { consumeTetrisGame } from "@/app/lib/tetris/db";
import { LINES_TARGET as TETRIS_LINES_TARGET } from "@/app/lib/tetris/engine";
import { consumeChessGame } from "@/app/lib/chess/db";
import { replayChessMoves } from "@/app/lib/chess/replay";
import { NextRequest } from "next/server";
import type { GameId } from "@/app/lib/scores/types";

async function createActivity(
  request: NextRequest,
  gameId: GameId,
  score: number,
  userId: string
): Promise<void> {

	console.log("Llamamos a crear actividad desde el backend!", process.env.NEXT_PUBLIC_ENABLE_LOGIN)
  if (process.env.NEXT_PUBLIC_ENABLE_LOGIN !== "true") {
    return;
  }

  const cookie = request.headers.get("cookie");
  const headers = {
    "Content-Type": "application/json",
    "OCS-APIRequest": "true",
    ...(cookie ? { Cookie: cookie } : {}),
  };

  try {
    const response = await fetch(
      `${process.env.NEXTCLOUD_URL}/index.php/apps/gaming/api/score`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          game: GAME_NAMES[gameId],
          score,
        }),
      }
    );

	console.log("Activity status:", response.status);

	const text = await response.text();
	console.log("Activity response:", text);
  } catch (err) {
    console.error("Unable to publish Nextcloud activity:", err);
  }

  // Récords batidos: cualquier jugador cuyo mejor score histórico en este
  // juego quede por debajo (o por encima, en tetris) del score recién
  // conseguido recibe una notificación individual en Nextcloud.
  try {
    const beatenPlayers = getPlayersBeatenByScore(gameId, userId, score);

    for (const player of beatenPlayers) {
      const response = await fetch(
        `${process.env.NEXTCLOUD_URL}/index.php/apps/gaming/api/notify`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            targetUserId: player.userId,
            game: GAME_NAMES[gameId],
            score,
            previousScore: player.previousBest,
          }),
        }
      );

      console.log("Notify status:", player.userId, response.status);
    }
  } catch (err) {
    console.error("Unable to send Nextcloud notifications:", err);
  }
}

function errorResponse(error: unknown): Response {
  const body: ScoresErrorResponse = { error: getErrorResponseMessage(error) };
  return Response.json(body, { status: getErrorStatus(error) });
}

// Chess tampoco manda un score de confianza: cada jugada ya se validó una a
// una contra /api/chess (legalidad vía chess.js, IA invocada server-side
// contra Stockfish con el elo guardado bajo el nonce, nunca el del
// cliente). Aquí solo hace falta reproducir el log de jugadas desde cero y
// comprobar que la partida realmente terminó en victoria del jugador.
//
// El jugador siempre juega con blancas (las negras las mueve el propio
// servidor vía Stockfish, nunca el cliente). isGameOver() por sí solo NO
// basta: también es true en tablas, ahogado o cuando es el JUGADOR quien
// recibe jaque mate — sin comprobar isCheckmate() + de qué color, cualquier
// final de partida (incluida una derrota autoinfligida en un par de
// jugadas) puntuaba igual que una victoria real. Solo se puntúa si, al
// terminar la partida, es a las negras a quien le toca mover y están en
// jaque mate (turn() === "b" && isCheckmate()): eso es lo único que
// significa que las blancas (el jugador) dieron mate. Las tablas no puntúan.
async function saveChessScore(request: NextRequest, user: AuthUser, params: any): Promise<Response> {
  const { nonce } = params;

  if (typeof nonce !== "string" || nonce.trim() === "") {
    return Response.json({ error: "nonce is required." }, { status: 400 });
  }

  const stored = consumeChessGame(nonce);
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

  const id = insertScore(user, GAME_IDS.CHESS, score, serializedConfig.value);

  const body: SaveScoreResponse = {
    message: "Score saved successfully.",
    id,
    score,
  };
  return Response.json(body, { status: 200 });
}

// Numbers no manda un score de confianza: manda el nonce de la partida
// (emitido por /api/numbers/new-game), el tablero inicial y los movimientos
// realizados. El servidor reproduce la partida y calcula el score él mismo.
async function saveNumbersScore(request: NextRequest, user: AuthUser, params: any): Promise<Response> {
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

  await createActivity(request, GAME_IDS.NUMBERS, finalScore, user.id);
  const id = insertScore(user, GAME_IDS.NUMBERS, finalScore, serializedConfig.value);

  const body: SaveScoreResponse = {
    message: "Score saved successfully.",
    id,
    score: finalScore,
  };
  return Response.json(body, { status: 200 });
}

// Words tampoco manda un score de confianza: cada ronda ya se validó una a
// una contra /api/words/answer (single-use). Puntúa cualquier partida que
// haya terminado, tanto si acertó las 10 rondas como si falló antes
// (stored.ended, marcado por /api/words/answer) — nunca una partida a
// medio jugar. El score es la misma fórmula que numbers: cubo de aciertos
// entre el tiempo, calculado con el reloj del servidor.
async function saveWordsScore(request: NextRequest, user: AuthUser, params: any): Promise<Response> {
  const { nonce } = params;

  if (typeof nonce !== "string" || nonce.trim() === "") {
    return Response.json({ error: "nonce is required." }, { status: 400 });
  }

  const stored = consumeWordsGame(nonce);
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
  });
  if (!serializedConfig.ok) {
    return Response.json({ error: serializedConfig.error }, { status: 400 });
  }

  await createActivity(request, GAME_IDS.WORDS, finalScore, user.id);
 
  const id = insertScore(user, GAME_IDS.WORDS, finalScore, serializedConfig.value);

  const body: SaveScoreResponse = {
    message: "Score saved successfully.",
    id,
    score: finalScore,
  };
  return Response.json(body, { status: 200 });
}

// Tetris tampoco manda un score de confianza: manda el nonce (que ata la
// partida a un seed de piezas fijo, emitido por /api/tetris/new-game) y el
// log de acciones con marca de tiempo relativa al inicio. El servidor
// reproduce la partida entera con el mismo motor que el cliente
// (app/lib/tetris/replay.ts) y solo si el replay llega de forma legal a
// LINES_TARGET calcula el tiempo final con su propio reloj.
async function saveTetrisScore(request: NextRequest, user: AuthUser, params: any): Promise<Response> {
  const { nonce, actions } = params;

  if (typeof nonce !== "string" || nonce.trim() === "") {
    return Response.json({ error: "nonce is required." }, { status: 400 });
  }

  const stored = consumeTetrisGame(nonce);
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
 
  const id = insertScore(user, GAME_IDS.TETRIS, elapsed, serializedConfig.value);

  const body: SaveScoreResponse = {
    message: "Score saved successfully.",
    id,
    score: elapsed,
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