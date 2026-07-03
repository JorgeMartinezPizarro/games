import { requireAuth } from "@/app/lib/auth";
import { LINES_TARGET } from "@/app/lib/tetris/engine";
import { createTetrisGame } from "@/app/lib/tetris/db";
import { errorMessage } from "@/app/helpers";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireAuth(request);
    const game = createTetrisGame(user.id);

    return Response.json({ ...game, linesTarget: LINES_TARGET }, { status: 200 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
