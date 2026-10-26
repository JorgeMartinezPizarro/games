import { expect, test, type Page } from "@playwright/test";

// Phone layout: no page may be wider than the screen. A horizontal scroll
// leaves an empty strip on the right and the page wobbles sideways while
// playing (it happened with the decorative glows, which are wider than the
// page). 320px is the narrowest phone we care about (iPhone SE 1st gen).
test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true });

const PAGES = ["", "/pages/games/chess", "/pages/games/words", "/pages/games/numbers", "/pages/games/tetris"];

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("Mobile layout", () => {
  for (const path of PAGES) {
    test(`no horizontal scroll on ${path || "/"}`, async ({ page }) => {
      await page.goto(`/bookmarks${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
      expect(await horizontalOverflow(page)).toBe(0);
    });
  }
});
