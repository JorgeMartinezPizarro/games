import { createHmac } from "node:crypto";

// API client for the Nextcloud "gaming" app
// (nextcloud/custom_apps/gaming). Every call is signed with HMAC-SHA256
// over "<timestamp>.<body>" using a shared secret
// (NEXTCLOUD_GAMING_SECRET here, shared_secret in the Nextcloud app's
// config). Nextcloud only publishes activity or notifications if the
// signature matches: that way nobody can call those endpoints with their own
// session and make up scores, bypassing the /api/scores replay.
export const TIMESTAMP_HEADER = "X-Gaming-Timestamp";
export const SIGNATURE_HEADER = "X-Gaming-Signature";

export type GamingEndpoint = "score" | "notify";

export function signGamingRequest(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

// Returns null (without calling Nextcloud) if configuration is missing: the
// activity is secondary and must never break saving the score.
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
