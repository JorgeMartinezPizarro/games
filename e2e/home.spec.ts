import { expect, test } from "@playwright/test";
import { e2eUser } from "./nextcloud";

// The home page ("/"): checks it shows the 4 real game cards with the player's
// personal best (or "No score yet" if there is none — which one depends on the
// order the other specs run in, GAME_IDS.CHESS(1)/WORDS(4)/NUMBERS(2)/TETRIS(3),
// so the assertions accept either state instead of pinning one) and that
// clicking a card really navigates to the game.
test.describe("Home", () => {
  test("shows the user and the 4 game cards, and navigates when one is clicked", async ({ page }) => {
    await page.goto("/bookmarks");

    // /api/user returns the user of the Nextcloud session (auth.setup.ts),
    // not the "anonymous" fallback.
    await expect(page.getByRole("heading", { name: `Hi, ${e2eUser()}` })).toBeVisible({ timeout: 15_000 });

    const games = [
      { key: "chess", name: "Chess", path: "/pages/games/chess" },
      { key: "words", name: "Words", path: "/pages/games/words" },
      { key: "numbers", name: "Numbers", path: "/pages/games/numbers" },
      { key: "tetris", name: "Tetris", path: "/pages/games/tetris" },
    ];

    for (const { key, name } of games) {
      await expect(page.getByTestId(`game-${key}`)).toContainText(name);
      // The best score shows "…" while useBestScores loads /api/scores?me=true
      // (real Docker); wait for the real final state.
      await expect(page.getByTestId(`best-${key}`)).toHaveText(/No score yet|·\s*#\d+/, { timeout: 15_000 });
    }

    await Promise.all([
      page.waitForURL(new RegExp(games[0].path)),
      page.getByTestId(`game-${games[0].key}`).click(),
    ]);
  });

  test("the Earth rotations chip saves the date in the browser", async ({ page }) => {
    await page.goto("/bookmarks");

    await page.getByRole("button", { name: /Earth rotations/ }).click();
    const date = page.getByLabel("Your date of birth");
    await date.fill("2000-01-01");
    await date.press("Enter");

    const chip = page.getByRole("button", { name: /^\d[\d,]* Earth rotations$/ });
    await expect(chip).toBeVisible();
    await page.reload();
    await expect(chip).toBeVisible({ timeout: 15_000 });
  });
});
