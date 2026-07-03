import { requireAuth } from "@/app/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ id: process.env.NEXT_PUBLIC_DEV_USER || "anonymous", name: "anonymous", email: "" });
  }
}
