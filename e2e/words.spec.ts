import { expect, test } from "@playwright/test";

// Words solo guarda score si se aciertan las 10 rondas (ver
// app/api/scores/route.ts#saveWordsScore) — y el objetivo correcto de cada
// ronda nunca llega al cliente hasta fallar (de un solo intento), así que
// completarlo a ciegas no es determinista. Este test es un smoke test: la
// partida real carga audio+opciones reales del contenedor wordlist, y se
// puede terminar (derrota) desde la UI con el botón "Finalizar partida".
test.describe("Words", () => {
  test("una partida real carga audio/opciones reales y se puede finalizar como derrota", async ({
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

    // Ronda real: audio + 4 opciones servidas por el contenedor wordlist real.
    await expect(page.getByText(/Ronda/)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".choice-btn")).toHaveCount(4);

    await page.getByRole("button", { name: /Finalizar partida/ }).click();

    await expect(page.getByText("Game Over")).toBeVisible();
    await expect(page.getByText(/Partida finalizada/)).toBeVisible();
  });
});
