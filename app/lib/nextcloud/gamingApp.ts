import { createHmac } from "node:crypto";

// Cliente de la API de la app "gaming" de Nextcloud
// (nextcloud/custom_apps/gaming). Cada llamada va firmada con HMAC-SHA256
// sobre "<timestamp>.<body>" con un secreto compartido
// (NEXTCLOUD_GAMING_SECRET aquí, shared_secret en la config de la app de
// Nextcloud). Nextcloud solo publica actividad o notificaciones si la firma
// cuadra: así nadie puede llamar a esos endpoints con su propia sesión e
// inventarse puntuaciones saltándose el replay de /api/scores.
export const TIMESTAMP_HEADER = "X-Gaming-Timestamp";
export const SIGNATURE_HEADER = "X-Gaming-Signature";

export type GamingEndpoint = "score" | "notify";

export function signGamingRequest(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

// Devuelve null (sin llamar a Nextcloud) si falta configuración: la
// actividad es secundaria y nunca debe tumbar el guardado del score.
export async function postToGamingApp(
  endpoint: GamingEndpoint,
  payload: Record<string, unknown>,
  cookie: string | null
): Promise<Response | null> {
  const nextcloudUrl = process.env.NEXTCLOUD_URL;
  const secret = process.env.NEXTCLOUD_GAMING_SECRET;
  if (!nextcloudUrl || !secret) {
    console.error(
      "Nextcloud gaming app not configured: NEXTCLOUD_URL and NEXTCLOUD_GAMING_SECRET are required."
    );
    return null;
  }

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);

  return fetch(`${nextcloudUrl}/ocs/v2.php/apps/gaming/api/v1/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "OCS-APIRequest": "true",
      [TIMESTAMP_HEADER]: String(timestamp),
      [SIGNATURE_HEADER]: signGamingRequest(secret, timestamp, body),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body,
  });
}
