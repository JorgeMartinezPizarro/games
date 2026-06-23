import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  console.log("Nextcloud auth middleware");

  if (process.env.NEXT_PUBLIC_ENABLE_LOGIN === "false") {
    return NextResponse.next();
  }

  const cookie = request.headers.get("cookie") || "";

  console.log("Cookie received:", cookie ? "YES" : "NO");

  // 🔴 Si nginx ya protege, esto ya debería ser suficiente
  if (!cookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 🟡 Validación REAL contra Nextcloud (OCS)
  const res = await fetch(
    (process.env.NEXTCLOUD_URL || "") + "/ocs/v2.php/cloud/user",
    {
      method: "GET",
      headers: {
        cookie,

        // 🔥 CLAVE en Nextcloud 33
        "OCS-APIRequest": "true",
        "Accept": "application/json",
      },
    }
  );

  console.log("OCS status:", res.status);

  // 🚨 Si Nextcloud rechaza la request
  if (!res.ok) {
    console.log("Auth failed → redirect login");
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 🟢 Parse seguro
  let data: any;
  try {
    data = await res.json();
  } catch (e) {
    console.log("Invalid JSON from Nextcloud");
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const userId = data?.ocs?.data?.id;

  console.log("Nextcloud user:", userId);

  if (!userId) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 🟢 Usuario autenticado
  return NextResponse.next();
}

// matcher intacto (como pediste)
export const config = {
  matcher: ['/pages/:path*'],
};