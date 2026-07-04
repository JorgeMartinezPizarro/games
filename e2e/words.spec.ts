import { expect, test } from "@playwright/test";

const ROUNDS_TOTAL = 10;

// Cualquier partida que termine puntúa ahora, gane o pierda (ver
// app/api/scores/route.ts#saveWordsScore): no hace falta acertar las 10
// rondas a ciegas para tener un score que comprobar. Elegimos siempre la
// primera opción de cada ronda real (audio + 4 opciones servidas por el
// contenedor wordlist real) hasta que el juego termine, sea por fallo o
// por completarlas todas.
test.describe("Words", () => {
  test("una partida real (ganada o perdida) guarda el score y aparece en el ranking", async ({
    page,
  }) => {
    await page.goto("/bookmarks/pages/games/words");

    const newGamePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/bookmarks/api/words/new-game") && res.request().method() === "POST"
    );
    await page.getByRole("button", { name: "JUGAR" }).click();
    const newGameResponse = await newGamePromise;
    expect(newGameResponse.ok()).toBe(true);

    const saveScoreResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/bookmarks/api/scores") && res.request().method() === "POST"
    );

    const panelTitle = page.locator(".panel-title");

    for (let round = 0; round < ROUNDS_TOTAL; round++) {
      // Espera a que la ronda esté lista (incluye la carga real de los 10
      // audios antes de la primera): no usar isVisible() sin esperar aquí,
      // que confundiría "todavía cargando" con "partida terminada".
      await expect(page.locator(".choice-btn").first()).toBeVisible({ timeout: 20_000 });
      await page.locator(".choice-btn").first().click();
      // Pausa de feedback del componente (500ms) antes de avanzar de ronda
      // o pasar a "finished".
      await page.waitForTimeout(650);

      if (await panelTitle.filter({ hasText: /Completado|Game Over/ }).isVisible()) break;
    }

    await expect(panelTitle).toContainText(/Completado|Game Over/, { timeout: 20_000 });

    // El backend real (Docker) calcula y guarda el score final.
    const saveScoreResponse = await saveScoreResponsePromise;
    expect(saveScoreResponse.ok()).toBe(true);
    const body = await saveScoreResponse.json();
    expect(typeof body.score).toBe("number");
    expect(body.score).toBeGreaterThanOrEqual(0);

    // El score guardado aparece en el ranking real (misma sesión, se recarga solo).
    await page.getByRole("button", { name: /Ver puntuaciones/ }).click();
    await expect(page.getByText("Mejores Puntuaciones")).toBeVisible();

    const targetRow = page.locator(".scoreboard-table tbody tr").filter({
      has: page.locator("td", { hasText: new RegExp(`^${body.score}$`) }),
    });
    await expect(targetRow.first()).toBeVisible();
  });
});
