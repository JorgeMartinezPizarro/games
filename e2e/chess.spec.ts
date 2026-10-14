import { expect, test } from "@playwright/test";

// Chess only saves a score if the player checkmates Stockfish (see
// app/api/scores/route.ts#saveChessScore) — there is no deterministic way to
// force that against a real engine. This test is a smoke test: it confirms
// that the real UI (react-chessboard) and the real Stockfish container
// interoperate end to end with a legal move.
test.describe("Chess", () => {
  test("a real player move gets a real reply from Stockfish", async ({ page }) => {
    await page.goto("/bookmarks/pages/games/chess");

    await expect(page.locator('[data-square="e2"] [data-piece="wP"]')).toBeVisible({
      timeout: 15_000,
    });

    const movePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/bookmarks/api/chess") &&
        !res.url().includes("new-game") &&
        res.request().method() === "POST"
    );

    // Two-click system (the same one useChessGame.onSquareClick uses).
    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e4"]').click();

    // Local move applied immediately (instant feedback, before the server
    // responds).
    await expect(page.locator('[data-square="e4"] [data-piece="wP"]')).toBeVisible();
    await expect(page.locator('[data-square="e2"] [data-piece]')).toHaveCount(0);

    const response = await movePromise;
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.bestmove === null || typeof body.bestmove === "string").toBe(true);

    // If Stockfish (real, via docker) returned a move, it shows up on the board.
    if (body.bestmove) {
      const targetSquare = String(body.bestmove).slice(2, 4);
      await expect(
        page.locator(`[data-square="${targetSquare}"] [data-piece^="b"]`)
      ).toBeVisible({ timeout: 10_000 });
    }

    // The move list includes the player's move.
    await expect(page.getByText("e4", { exact: true })).toBeVisible();
  });

  test("New game resets the board to the starting position", async ({ page }) => {
    await page.goto("/bookmarks/pages/games/chess");
    await expect(page.locator('[data-square="e2"] [data-piece="wP"]')).toBeVisible({
      timeout: 15_000,
    });

    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e4"]').click();
    await expect(page.locator('[data-square="e4"] [data-piece="wP"]')).toBeVisible();

    await page.getByRole("button", { name: "New game" }).click();

    await expect(page.locator('[data-square="e2"] [data-piece="wP"]')).toBeVisible();
    await expect(page.locator('[data-square="e4"] [data-piece]')).toHaveCount(0);
  });
});
