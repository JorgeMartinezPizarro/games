import { expect, test as setup } from "@playwright/test";
import { STORAGE_STATE, e2ePassword, e2eUser, nextcloudUrl } from "./nextcloud";

// The no-login mode no longer exists: the specs play with a real Nextcloud
// session. We log in once, like a real user, and save the cookies. Since
// cookies are not port-specific, the Nextcloud session on localhost is also
// valid for games on localhost:PORT.
setup("logs in to Nextcloud", async ({ page }) => {
  await page.goto(`${nextcloudUrl()}/login`);
  await page.locator('input[name="user"]').fill(e2eUser());
  await page.locator('input[name="password"]').fill(e2ePassword());
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL(/\/apps\//);

  // games recognizes the Nextcloud session (requireAuth → /ocs/v2.php/cloud/user).
  const user = await page.request.get("/bookmarks/api/user");
  expect((await user.json()).id).toBe(e2eUser());

  await page.context().storageState({ path: STORAGE_STATE });
});
