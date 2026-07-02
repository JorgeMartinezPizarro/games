import { getCurrentUser } from "@/app/lib/auth";
import { advanceWordsGame, deleteWordsGame, getWordsGame } from "@/app/lib/words/db";
import { errorMessage } from "@/app/helpers";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await getCurrentUser(request);
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

    const game = getWordsGame(nonce);
    if (!game || game.userId !== user.id) {
      return Response.json({ error: "Invalid or expired nonce." }, { status: 400 });
    }

    // Solo se puede responder la siguiente ronda esperada: evita saltarse
    // rondas o reintentar una ya resuelta.
    const round = game.rounds[parsedIndex];
    if (parsedIndex !== game.answeredCount || !round) {
      deleteWordsGame(nonce);
      return Response.json({ error: "Unexpected round." }, { status: 400 });
    }

    if (answer !== round.target) {
      // Una respuesta incorrecta termina la partida ahí mismo: un único
      // intento por ronda, así probar las opciones a fuerza bruta no sale
      // gratis (el nonce muere en el primer fallo).
      deleteWordsGame(nonce);
      return Response.json({ correct: false, target: round.target }, { status: 200 });
    }

    const answeredCount = advanceWordsGame(nonce);
    const finished = answeredCount >= game.rounds.length;

    return Response.json({ correct: true, finished }, { status: 200 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
