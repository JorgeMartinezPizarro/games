import { errorMessage } from "@/app/helpers";
import { requireAuth } from "@/app/lib/auth";
import { appendChessMove, deleteChessGame, getChessGame } from "@/app/lib/chess/db";
import { MAX_PLIES, moveToUci, replayChessMoves } from "@/app/lib/chess/replay";
import { NextRequest } from "next/server";

// La URL correcta para Stockfish, basada en la configuración de Nginx
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
    throw new Error(`No se encontró 'bestmove' en la respuesta de Stockfish: ${stockfishResponse}`);
  }

  const match = bestMoveLine.match(/bestmove\s(\S+)/);
  const bestmove = match?.[1];
  if (!bestmove || bestmove === "(none)") {
    throw new Error(`Stockfish no devolvió una jugada válida: ${bestMoveLine}`);
  }

  return bestmove;
}

// El servidor es la única autoridad: reconstruye la posición actual a
// partir del log de jugadas guardado bajo el nonce (nunca de un FEN mandado
// por el cliente), valida la jugada del jugador con chess.js, y solo si la
// partida sigue en curso invoca a Stockfish él mismo con el elo fijado al
// crear la partida (nunca el que mande el cliente). Tanto la jugada del
// jugador como la de la IA quedan grabadas en game_chess antes de
// responder, para poder reproducir y validar la partida entera al guardar
// el score en /api/scores.
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
      // El propio servidor escribió este log: si está corrupto no hay forma
      // de recuperar la partida.
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
      // La jugada del jugador ya quedó grabada; no grabamos nada más para
      // esta jugada de la IA y dejamos el estado consistente para que el
      // cliente trate esto como un error fatal (igual que un fallo de red).
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
    console.error("Error en /bookmarks/api/chess:", error);
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
