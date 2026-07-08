import { requireAuth } from "@/app/lib/auth";
import { advanceWordsGame, deleteWordsGame, getWordsGame, markWordsGameEnded } from "@/app/lib/words/db";
import { errorMessage } from "@/app/helpers";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireAuth(request);
    const { nonce, roundIndex, answer } = await request.json();

    if (typeof nonce !== "string" || nonce.trim() === "") {
      return Response.json({ error: "nonce is required." }, { status: 400 });
    }

    const parsedIndex = Number(roundIndex);
    if (!Number.isInteger(parsedIndex) || parsedIndex < 0) {
      return Response.json(
        { error: "roundIndex must be a non-negative integer." },
        { status: 400 }
      );
    }

    if (typeof answer !== "string" || answer.trim() === "") {
      return Response.json({ error: "answer is required." }, { status: 400 });
    }

    const game = await getWordsGame(nonce);
    if (!game || game.userId !== user.id) {
      return Response.json({ error: "Invalid or expired nonce." }, { status: 400 });
    }

    // Una partida ya terminada (falló una ronda) no admite más respuestas:
    // el nonce solo sirve ya para consultarse desde /api/scores.
    if (game.ended) {
      return Response.json({ error: "Game already ended." }, { status: 400 });
    }

    // Solo se puede responder la siguiente ronda esperada: evita saltarse
    // rondas o reintentar una ya resuelta.
    const round = game.rounds[parsedIndex];
    if (parsedIndex !== game.answeredCount || !round) {
      await deleteWordsGame(nonce);
      return Response.json({ error: "Unexpected round." }, { status: 400 });
    }

    if (answer !== round.target) {
      // Una respuesta incorrecta termina la partida ahí mismo: un único
      // intento por ronda, así probar las opciones a fuerza bruta no sale
      // gratis. Ya no se borra el nonce: queda marcado como terminado para
      // que /api/scores pueda puntuar los aciertos logrados hasta aquí
      // (cualquier partida que termine, ganada o perdida, puntúa).
      await markWordsGameEnded(nonce);
      return Response.json({ correct: false, target: round.target }, { status: 200 });
    }

    const answeredCount = await advanceWordsGame(nonce);
    const finished = answeredCount >= game.rounds.length;

    return Response.json({ correct: true, finished }, { status: 200 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
