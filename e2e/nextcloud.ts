import type { APIRequestContext } from "@playwright/test";

// Nextcloud 34 del stack e2e (docker-compose.nextcloud.yml), con los valores
// de .env.e2e. Se leen en cada llamada y no al importar: playwright.config.ts
// importa este módulo antes de cargar .env.e2e.
export const nextcloudUrl = () => process.env.NEXTCLOUD_URL ?? "http://localhost:1180";
export const e2eUser = () => (process.env.NEXTCLOUD_TEST_USERS ?? "e2e-tester").trim().split(/\s+/)[0];
export const e2ePassword = () => process.env.NEXTCLOUD_TEST_PASSWORD ?? "";

// Cookies de la sesión de Nextcloud que comparten todos los specs (las
// guarda auth.setup.ts).
export const STORAGE_STATE = "cache/e2e/nextcloud-session.json";

type Activity = { app: string; subject: string; link: string };

// Actividad de la app gaming visible para el usuario de la sesión, la más
// reciente primero.
export async function gamingActivities(request: APIRequestContext): Promise<Activity[]> {
  const res = await request.get(
    `${nextcloudUrl()}/ocs/v2.php/apps/activity/api/v2/activity/all?format=json`,
    { headers: { "OCS-APIRequest": "true" } }
  );
  // 304 = el stream está vacío.
  if (res.status() === 304) return [];
  const body = await res.json();
  return (body.ocs.data as Activity[]).filter((activity) => activity.app === "gaming");
}
