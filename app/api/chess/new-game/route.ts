import { requireAuth } from "@/app/lib/auth";
import { createChessGame } from "@/app/lib/chess/db";
import { errorMessage } from "@/app/helpers";
import { NextRequest } from "next/server";

const MIN_ELO = 400;
const MAX_ELO = 3000;

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireAuth(request);

    const { elo } = await request.json();
    const parsedElo = Number(elo);
    if (!Number.isInteger(parsedElo) || parsedElo < MIN_ELO || parsedElo > MAX_ELO) {
      return Response.json(
        { error: `elo must be an integer between ${MIN_ELO} and ${MAX_ELO}.` },
        { status: 400 }
      );
    }

    const game = await createChessGame(user.id, parsedElo);
    return Response.json(game, { status: 200 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
