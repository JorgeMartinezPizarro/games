import { expect, test } from "@playwright/test";
import { e2eUser } from "./nextcloud";

// app/page.tsx (la portada, "/") no tenía ningún e2e: comprueba que muestra
// las 4 tarjetas de juego reales con su mejor score personal (o "Sin
// registro" si aún no hay, según el orden real en que se ejecuten los
// otros specs, GAME_IDS.CHESS(1)/WORDS(4)/NUMBERS(2)/TETRIS(3) — por eso
// las aserciones aceptan cualquiera de los dos estados en vez de fijar uno)
// y que pulsar una tarjeta navega de verdad al juego.
test.describe("Home", () => {
  test("la portada muestra usuario y las 4 tarjetas de juego, y navega al pulsar una", async ({
    page,
  }) => {
    await page.goto("/bookmarks");

    // /api/user devuelve el usuario de la sesión de Nextcloud (auth.setup.ts),
    // no el fallback "anonymous".
    await expect(page.getByRole("heading", { name: `Hola, ${e2eUser()}` })).toBeVisible({ timeout: 15_000 });

    const games = [
      { key: "chess", name: "Ajedrez", path: "/pages/games/chess" },
      { key: "words", name: "Palabras", path: "/pages/games/words" },
      { key: "numbers", name: "Números", path: "/pages/games/numbers" },
      { key: "tetris", name: "Tetris", path: "/pages/games/tetris" },
    ];

    for (const { key, name } of games) {
      await expect(page.getByTestId(`game-${key}`)).toContainText(name);
      // La marca muestra "…" mientras useBestScores carga /api/scores?me=true
      // (Docker real); se espera a que resuelva al estado final real.
      await expect(page.getByTestId(`best-${key}`)).toHaveText(/Sin registro|·\s*#\d+/, { timeout: 15_000 });
    }

    await Promise.all([
      page.waitForURL(new RegExp(games[0].path)),
      page.getByTestId(`game-${games[0].key}`).click(),
    ]);
  });

  test("el chip de vueltas a la Tierra guarda la fecha en el navegador", async ({ page }) => {
    await page.goto("/bookmarks");

    await page.getByRole("button", { name: /vueltas a la Tierra/ }).click();
    const date = page.getByLabel("Tu fecha de nacimiento");
    await date.fill("2000-01-01");
    await date.press("Enter");

    const chip = page.getByRole("button", { name: /^\d[\d.]* vueltas a la Tierra$/ });
    await expect(chip).toBeVisible();
    await page.reload();
    await expect(chip).toBeVisible({ timeout: 15_000 });
  });
});
