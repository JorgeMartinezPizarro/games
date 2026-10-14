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

    // An already-ended game (a round was missed) accepts no more answers:
    // the nonce is now only good for being looked up from /api/scores.
    if (game.ended) {
      return Response.json({ error: "Game already ended." }, { status: 400 });
    }

    // Only the next expected round can be answered: prevents skipping
    // rounds or retrying one already solved.
    const round = game.rounds[parsedIndex];
    if (parsedIndex !== game.answeredCount || !round) {
      await deleteWordsGame(nonce);
      return Response.json({ error: "Unexpected round." }, { status: 400 });
    }

    if (answer !== round.target) {
      // A wrong answer ends the game right there: a single attempt per
      // round, so brute-forcing the choices doesn't come for free. The
      // nonce is no longer deleted: it's marked as ended so /api/scores can
      // score the correct answers achieved so far (any game that ends, won
      // or lost, scores).
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
