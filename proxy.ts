import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Without a valid session the user is sent to the Nextcloud login, since
// Nextcloud is the one that authenticates. After signing in, Nextcloud opens
// that same page inside its gaming app (deeplink /apps/gaming/<path>).
// NEXTCLOUD_PUBLIC_URL is the URL the browser sees, in case the server talks
// to Nextcloud via a different one (e.g. http://nextcloud inside docker
// compose); otherwise NEXTCLOUD_URL is used.
function redirectToLogin(request: NextRequest): NextResponse {
  const nextcloud = (process.env.NEXTCLOUD_PUBLIC_URL || process.env.NEXTCLOUD_URL || "").replace(/\/+$/, "");
  if (!nextcloud) {
    console.error("Missing NEXTCLOUD_URL");
    return new NextResponse("Server misconfigured: NEXTCLOUD_URL is missing.", { status: 500 });
  }

  const { pathname, search } = request.nextUrl;
  const deeplink = `/index.php/apps/gaming${pathname}${search}`;
  return NextResponse.redirect(`${nextcloud}/login?redirect_url=${encodeURIComponent(deeplink)}`);
}

export async function proxy(request: NextRequest) {
  console.log("Nextcloud auth middleware");

  const cookie = request.headers.get("cookie") || "";

  if (!cookie) {
    console.log("No cookie → redirect login");
    return redirectToLogin(request);
  }

  const nextcloudUrl = process.env.NEXTCLOUD_URL;
  if (!nextcloudUrl) {
    return redirectToLogin(request);
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
    return redirectToLogin(request);
  }

  console.log("OCS status:", res.status);

  if (!res.ok) {
    console.log("Auth failed → redirect login");
    return redirectToLogin(request);
  }

  let data: { ocs?: { data?: { id?: string | number } } };
  try {
    data = await res.json();
  } catch {
    console.log("Invalid JSON from Nextcloud");
    return redirectToLogin(request);
  }

  const userId = data?.ocs?.data?.id;
  console.log("Nextcloud user:", userId);

  if (!userId) {
    return redirectToLogin(request);
  }

  return NextResponse.next();
}

// The home page too: without a session there's no name or best scores to show.
export const config = {
  matcher: ["/", "/pages/:path*"],
};
