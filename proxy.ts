import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  console.log("Nextcloud auth middleware");

  if (process.env.NEXT_PUBLIC_ENABLE_LOGIN === "false") {
    return NextResponse.next();
  }

  const cookie = request.headers.get("cookie") || "";

  if (!cookie) {
    console.log("No cookie → redirect login");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const nextcloudUrl = process.env.NEXTCLOUD_URL;
  if (!nextcloudUrl) {
    console.error("Missing NEXTCLOUD_URL");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let res: Response;
  try {
    res = await fetch(`${nextcloudUrl}/ocs/v2.php/cloud/user?format=json`, {
      headers: {
        cookie,
        Accept: "application/json",
        "OCS-APIRequest": "true",
      },
    });
  } catch (e) {
    console.error("Nextcloud unreachable:", e);
    return NextResponse.redirect(new URL("/login", request.url));
  }

  console.log("OCS status:", res.status);

  if (!res.ok) {
    console.log("Auth failed → redirect login");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let data: { ocs?: { data?: { id?: string | number } } };
  try {
    data = await res.json();
  } catch {
    console.log("Invalid JSON from Nextcloud");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const userId = data?.ocs?.data?.id;
  console.log("Nextcloud user:", userId);

  if (!userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/pages/:path*"],
};