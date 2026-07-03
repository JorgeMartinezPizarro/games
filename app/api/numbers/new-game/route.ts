import { requireAuth } from "@/app/lib/auth";
import { createNumbersGame } from "@/app/lib/numbers/db";
import { errorMessage } from "@/app/helpers";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireAuth(request);
    const { nonce, timestamp, board } = createNumbersGame(user.id);

    return Response.json({ nonce, timestamp, board }, { status: 200 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
