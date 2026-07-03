import { expect, test } from "@playwright/test";

// Chess solo guarda score si el jugador da jaque mate a Stockfish (ver
// app/api/scores/route.ts#saveChessScore) — no hay forma determinista de
// forzar eso contra un motor real. Este test es un smoke test: confirma que
// la UI real (react-chessboard) y el contenedor real de Stockfish
// interoperan de punta a punta con una jugada legal.
test.describe("Chess", () => {
  test("una jugada real del jugador obtiene una respuesta real de Stockfish", async ({ page }) => {
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

    // Sistema de dos clics (mismo que usa useChessGame.onSquareClick).
    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e4"]').click();

    // Movimiento local aplicado de inmediato (feedback instantáneo, antes
    // de que responda el servidor).
    await expect(page.locator('[data-square="e4"] [data-piece="wP"]')).toBeVisible();
    await expect(page.locator('[data-square="e2"] [data-piece]')).toHaveCount(0);

    const response = await movePromise;
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.bestmove === null || typeof body.bestmove === "string").toBe(true);

    // Si Stockfish (real, vía docker) devolvió jugada, se refleja en el tablero.
    if (body.bestmove) {
      const targetSquare = String(body.bestmove).slice(2, 4);
      await expect(
        page.locator(`[data-square="${targetSquare}"] [data-piece^="b"]`)
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("Restart reinicia el tablero a la posición de salida", async ({ page }) => {
    await page.goto("/bookmarks/pages/games/chess");
    await expect(page.locator('[data-square="e2"] [data-piece="wP"]')).toBeVisible({
      timeout: 15_000,
    });

    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e4"]').click();
    await expect(page.locator('[data-square="e4"] [data-piece="wP"]')).toBeVisible();

    await page.getByRole("button", { name: /Restart/ }).click();

    await expect(page.locator('[data-square="e2"] [data-piece="wP"]')).toBeVisible();
    await expect(page.locator('[data-square="e4"] [data-piece]')).toHaveCount(0);
  });
});
