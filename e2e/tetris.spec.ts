import { expect, test } from "@playwright/test";

// Tetris solo guarda score si el replay llega a LINES_TARGET (25 líneas) —
// completar eso de verdad requiere una estrategia real de apilado, fuera
// de alcance para un smoke test. En su lugar: movimientos reales por
// teclado (prueban la integración real con el seed del servidor) y luego
// se deja que la gravedad natural (sin mover más) termine apilando hasta
// un game over real, sin ningún atajo de test.
test.describe("Tetris", () => {
  test("se puede jugar con teclado real y la partida termina en game over real", async ({
    page,
  }) => {
    test.setTimeout(150_000);

    await page.goto("/bookmarks/pages/games/tetris");

    await page.getByRole("button", { name: "START" }).click();
    await expect(page.getByRole("button", { name: "STOP" })).toBeVisible({ timeout: 15_000 });

    const linesBefore = await page.getByText(/LINES:/).innerText();
    expect(linesBefore).toContain("0/25");

    // Controles reales por teclado (mismos listeners que useTetris probó en
    // los tests unitarios): mover, rotar y forzar una caída rápida.
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("o"); // rotar izquierda
    await page.keyboard.press("p"); // rotar derecha
    await page.keyboard.down("s"); // soft drop mantenido
    await page.waitForTimeout(300);
    await page.keyboard.up("s");

    // Sin mover más: la gravedad sigue apilando piezas en la misma columna
    // de salida hasta que topa (game over real, sin atajos).
    await expect(page.getByText("GAME OVER")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("button", { name: "START" })).toBeVisible();
  });
});
