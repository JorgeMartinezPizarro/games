import { errorMessage } from "@/app/helpers";
import { requireAuth } from "@/app/lib/auth";
import { NextRequest } from "next/server";

// Placeholder for a standard GET request from the UI
export async function GET(request: NextRequest): Promise<Response> {
  
  try {

    if (process.env.NEXT_PUBLIC_ENABLE_LOGIN === "true")
		await requireAuth(request);

    const { searchParams } = new URL(request.url)
    
    const params = {
      a: searchParams.get("a"),
      b: searchParams.get("b"),
      c: searchParams.get("c"),
    }
    
    return Response.json(params, { status: 200})
  } catch (error) { 
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
