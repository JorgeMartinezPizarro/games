import { requireAuth } from "@/app/lib/auth";
import { createWordsGame } from "@/app/lib/words/db";
import { errorMessage } from "@/app/helpers";
import { NextRequest } from "next/server";

const DEFAULT_ROUNDS = 10;
const DEFAULT_CHOICES = 4;

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireAuth(request);
    const { searchParams } = new URL(request.url);

    const roundsParam = Number(searchParams.get("rounds"));
    const choicesParam = Number(searchParams.get("choices"));
    const rounds = Number.isInteger(roundsParam) && roundsParam > 0 ? roundsParam : DEFAULT_ROUNDS;
    const choices = Number.isInteger(choicesParam) && choicesParam > 0 ? choicesParam : DEFAULT_CHOICES;

    const game = await createWordsGame(user.id, rounds, choices);

    return Response.json(game, { status: 200 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
