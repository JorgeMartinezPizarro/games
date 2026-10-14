import { errorMessage } from "@/app/helpers";
import { requireAuth } from "@/app/lib/auth";
import { appendChessMove, deleteChessGame, getChessGame } from "@/app/lib/chess/db";
import { MAX_PLIES, moveToUci, replayChessMoves } from "@/app/lib/chess/replay";
import { NextRequest } from "next/server";

// The correct URL for Stockfish, based on the Nginx configuration
const STOCKFISH_API_URL = process.env.NEXT_PUBLIC_CHESS_URL
  ? process.env.NEXT_PUBLIC_CHESS_URL + "/chess"
  : `${process.env.NEXTCLOUD_URL}/chess`;

async function fetchStockfishMove(fen: string, elo: number): Promise<string> {
  const payload = `uci
setoption name UCI_LimitStrength value true
setoption name UCI_Elo value ${elo}
setoption name Hash value 2048
setoption name Threads value 4
isready
position fen ${fen}
go movetime 1500
`.trim();

  const response = await fetch(STOCKFISH_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: payload,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stockfish API error: ${response.status}: ${errorText}`);
  }

  const { response: stockfishResponse } = await response.json();
  const bestMoveLine = stockfishResponse.find((line: string) => line.startsWith("bestmove"));
  if (!bestMoveLine) {
    throw new Error(`No 'bestmove' in the Stockfish response: ${stockfishResponse}`);
  }

  const match = bestMoveLine.match(/bestmove\s(\S+)/);
  const bestmove = match?.[1];
  if (!bestmove || bestmove === "(none)") {
    throw new Error(`Stockfish did not return a valid move: ${bestMoveLine}`);
  }

  return bestmove;
}

// The server is the sole authority: it rebuilds the current position from
// the move log stored under the nonce (never from a client-sent FEN),
// validates the player's move with chess.js, and only if the game is still
// in progress does it call Stockfish itself, with the elo fixed when the
// game was created (never the one the client sends). Both the player's move
// and the AI's are recorded in game_chess before responding, so the whole
// game can be replayed and validated when the score is saved in
// /api/scores.
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const user = await requireAuth(req);

    const params = await req.json();
    const { nonce, move } = params;

    if (typeof nonce !== "string" || nonce.trim() === "") {
      return Response.json({ error: "nonce is required." }, { status: 400 });
    }
    if (
      typeof move !== "object" ||
      move === null ||
      typeof move.from !== "string" ||
      typeof move.to !== "string"
    ) {
      return Response.json({ error: "move must be an object with from/to." }, { status: 400 });
    }

    const stored = await getChessGame(nonce);
    if (!stored || stored.userId !== user.id) {
      return Response.json({ error: "Invalid or expired nonce." }, { status: 400 });
    }

    if (stored.moves.length >= MAX_PLIES) {
      await deleteChessGame(nonce);
      return Response.json({ error: "Game exceeded maximum length." }, { status: 400 });
    }

    const replay = replayChessMoves(stored.moves);
    if (!replay.valid) {
      // The server itself wrote this log: if it's corrupted there is no way
      // to recover the game.
      await deleteChessGame(nonce);
      return Response.json({ error: `Corrupted game state: ${replay.reason}` }, { status: 500 });
    }
    if (replay.gameOver) {
      return Response.json({ error: "Game already over." }, { status: 400 });
    }

    let playerMove;
    try {
      playerMove = replay.chess.move({
        from: move.from,
        to: move.to,
        promotion: typeof move.promotion === "string" ? move.promotion : undefined,
      });
    } catch (moveError) {
      return Response.json({ error: `Illegal move: ${errorMessage(moveError)}` }, { status: 400 });
    }

    const playerUci = moveToUci(playerMove);
    if (!(await appendChessMove(nonce, stored.movesJson, playerUci))) {
      return Response.json({ error: "Game state changed, please retry." }, { status: 409 });
    }

    if (replay.chess.isGameOver()) {
      return Response.json({ bestmove: null, gameOver: true }, { status: 200 });
    }

    const bestmove = await fetchStockfishMove(replay.chess.fen(), stored.elo);

    let aiMove;
    try {
      aiMove = replay.chess.move({
        from: bestmove.slice(0, 2),
        to: bestmove.slice(2, 4),
        promotion: bestmove.length === 5 ? bestmove.slice(4) : undefined,
      });
    } catch (moveError) {
      // The player's move is already recorded; we record nothing else for
      // this AI move and leave the state consistent so the client treats
      // this as a fatal error (same as a network failure).
      return Response.json(
        { error: `Stockfish proposed an illegal move: ${errorMessage(moveError)}` },
        { status: 500 }
      );
    }

    const aiUci = moveToUci(aiMove);
    const movesJsonAfterPlayer = JSON.stringify([...stored.moves, playerUci]);
    if (!(await appendChessMove(nonce, movesJsonAfterPlayer, aiUci))) {
      return Response.json({ error: "Game state changed, please retry." }, { status: 409 });
    }

    return Response.json(
      { bestmove: aiUci, gameOver: replay.chess.isGameOver() },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in /bookmarks/api/chess:", error);
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
