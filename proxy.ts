import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Sin sesión válida se manda al login de Nextcloud, que es quien autentica.
// Tras iniciar sesión, Nextcloud abre esa misma página dentro de su app
// gaming (deeplink /apps/gaming/<ruta>). NEXTCLOUD_PUBLIC_URL es la URL que
// ve el navegador, por si el servidor habla con Nextcloud por otra (p. ej.
// http://nextcloud dentro de docker compose); si no, se usa NEXTCLOUD_URL.
function redirectToLogin(request: NextRequest): NextResponse {
  const nextcloud = (process.env.NEXTCLOUD_PUBLIC_URL || process.env.NEXTCLOUD_URL || "").replace(/\/+$/, "");
  if (!nextcloud) {
    console.error("Missing NEXTCLOUD_URL");
    return new NextResponse("Servidor mal configurado: falta NEXTCLOUD_URL.", { status: 500 });
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

// La portada también: sin sesión no hay nombre ni marcas que enseñar.
export const config = {
  matcher: ["/", "/pages/:path*"],
};
