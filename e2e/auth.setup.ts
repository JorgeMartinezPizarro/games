import { expect, test as setup } from "@playwright/test";
import { STORAGE_STATE, e2ePassword, e2eUser, nextcloudUrl } from "./nextcloud";

// Ya no existe el modo sin login: los specs juegan con una sesión real de
// Nextcloud. Se inicia sesión una vez, como un usuario real, y se guardan las
// cookies. Como las cookies no distinguen puertos, la sesión de Nextcloud en
// localhost vale también para games en localhost:PORT.
setup("inicia sesión en Nextcloud", async ({ page }) => {
  await page.goto(`${nextcloudUrl()}/login`);
  await page.locator('input[name="user"]').fill(e2eUser());
  await page.locator('input[name="password"]').fill(e2ePassword());
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL(/\/apps\//);

  // games reconoce la sesión de Nextcloud (requireAuth → /ocs/v2.php/cloud/user).
  const user = await page.request.get("/bookmarks/api/user");
  expect((await user.json()).id).toBe(e2eUser());

  await page.context().storageState({ path: STORAGE_STATE });
});
