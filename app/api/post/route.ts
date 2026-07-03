import { errorMessage } from "@/app/helpers";
import { requireAuth } from "@/app/lib/auth";
import { NextRequest } from "next/server";

// Placeholder for a standard POST request from the UI
export async function POST(request: NextRequest): Promise<Response> {  

  try {

    await requireAuth(request);

    const params = await request.json();

    const { a, b, c } = params;

    return Response.json(params, {
      status: 200
    })
    
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
