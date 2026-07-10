import { expect, test } from "@playwright/test";

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

    // NEXT_PUBLIC_DEV_USER (docker-compose.yml) ya se propaga al contenedor
    // en runtime, así que con login desactivado /api/user devuelve de verdad
    // el usuario de .env.e2e ("e2e-tester"), no el fallback "anonymous".
    await expect(page.getByText(/riding Earth's spin/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Dear e2e-tester, you've been riding Earth's spin/)).toBeVisible();

    const games = [
      { alt: "Chess", path: "/pages/games/chess" },
      { alt: "Wording", path: "/pages/games/words" },
      { alt: "Numbers", path: "/pages/games/numbers" },
      { alt: "Tetris", path: "/pages/games/tetris" },
    ];

    for (const { alt } of games) {
      const card = page.locator(".MuiCard-root", { hasText: alt });
      await expect(card).toBeVisible();
      // El badge muestra "..." mientras useBestScores carga /api/scores?me=true
      // (Docker real); se espera a que resuelva al estado final real.
      await expect(card.getByText(/Sin registro|·\s*#\d+/)).toBeVisible({ timeout: 15_000 });
    }

    await Promise.all([
      page.waitForURL(new RegExp(games[0].path)),
      page.locator(".MuiCard-root", { hasText: games[0].alt }).click(),
    ]);
  });
});
