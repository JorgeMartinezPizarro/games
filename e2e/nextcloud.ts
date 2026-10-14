import type { APIRequestContext } from "@playwright/test";

// Nextcloud 34 from the e2e stack (docker-compose.nextcloud.yml), with the values
// from .env.e2e. They are read on every call rather than at import time:
// playwright.config.ts imports this module before loading .env.e2e.
export const nextcloudUrl = () => process.env.NEXTCLOUD_URL ?? "http://localhost:1180";
export const e2eUser = () => (process.env.NEXTCLOUD_TEST_USERS ?? "e2e-tester").trim().split(/\s+/)[0];
export const e2ePassword = () => process.env.NEXTCLOUD_TEST_PASSWORD ?? "";

// Cookies of the Nextcloud session shared by all specs (saved by
// auth.setup.ts).
export const STORAGE_STATE = "cache/e2e/nextcloud-session.json";

type Activity = { app: string; subject: string; link: string };

// Activity of the gaming app visible to the session's user, most recent
// first.
export async function gamingActivities(request: APIRequestContext): Promise<Activity[]> {
  const res = await request.get(
    `${nextcloudUrl()}/ocs/v2.php/apps/activity/api/v2/activity/all?format=json`,
    { headers: { "OCS-APIRequest": "true" } }
  );
  // 304 = the stream is empty.
  if (res.status() === 304) return [];
  const body = await res.json();
  return (body.ocs.data as Activity[]).filter((activity) => activity.app === "gaming");
}
