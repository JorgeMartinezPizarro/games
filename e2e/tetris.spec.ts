import { devices, expect, test } from "@playwright/test";

// Tetris solo guarda score si el replay llega a LINES_TARGET (25 líneas) —
// completar eso de verdad requiere una estrategia real de apilado, fuera
// de alcance para un smoke test. En su lugar: movimientos reales por
// teclado (prueban la integración real con el seed del servidor) y luego
// se mantiene S pulsada (soft drop real, mismo listener que useTetris probó
// en los tests unitarios) sin mover más la columna de salida, hasta que
// apila piezas y llega a un game over real, sin ningún atajo de test.
test.describe("Tetris", () => {
  test("se puede jugar con teclado real y la partida termina en game over real", async ({
    page,
  }) => {
    test.setTimeout(90_000);

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

    // Mantener S pulsada acelera la caída (soft drop repetido cada 100ms,
    // HOLD_REPEAT_RATE en useTetris.ts) frente a la gravedad natural
    // (184ms/fila, DROP_SPEED_MS): sin mover más la columna de salida, esto
    // apila piezas y llega a un game over real bastante antes que soltar la
    // tecla y esperar solo a la gravedad.
    await page.keyboard.down("s");
    await expect(page.getByText("GAME OVER")).toBeVisible({ timeout: 60_000 });
    await page.keyboard.up("s");
    await expect(page.getByRole("button", { name: "START" })).toBeVisible();
  });
});

// Los controles táctiles (MobileControls en page.tsx) solo se muestran en
// el layout móvil (.mobile-only, ver styles.css: max-width 768px o
// hover:none+pointer:coarse), así que hace falta emular un viewport móvil
// real (Pixel 7, hasTouch) para que se rendericen y comprobar que el juego
// también se puede jugar por touch, no solo con teclado.
test.describe("Tetris (móvil)", () => {
  // defaultBrowserType se excluye a propósito: fijarlo dentro de un
  // describe (en vez de a nivel de proyecto) fuerza un worker nuevo y
  // Playwright lo rechaza; el proyecto ya usa chromium, así que no hace falta.
  const { defaultBrowserType: _defaultBrowserType, ...pixel7 } = devices["Pixel 7"];
  test.use({ ...pixel7 });

  test("se puede jugar con los controles táctiles y la partida termina en game over real", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto("/bookmarks/pages/games/tetris");

    await page.getByRole("button", { name: "START" }).click();
    await expect(page.getByRole("button", { name: "STOP" })).toBeVisible({ timeout: 15_000 });

    const linesBefore = await page.getByText(/LINES:/).innerText();
    expect(linesBefore).toContain("0/25");

    // Mismos controles reales que el test de teclado, pero disparados por
    // touch (mismos startRepeat/moveLeft/moveRight/rotateLeft/rotateRight
    // que useTetris expone también al teclado): mover y rotar.
    await page.getByRole("button", { name: "Izquierda (A)" }).tap();
    await page.getByRole("button", { name: "Derecha (D)" }).tap();
    await page.getByRole("button", { name: "Girar izquierda (O)" }).tap();
    await page.getByRole("button", { name: "Girar derecha (P)" }).tap();

    // Mantener el botón de bajar (touchstart real, sin touchend todavía)
    // acelera la caída igual que mantener S en el teclado: sin mover más la
    // columna de salida, esto apila piezas hasta un game over real.
    const downButton = page.getByRole("button", { name: "Bajar (S)" });
    await downButton.dispatchEvent("touchstart");
    await expect(page.getByText("GAME OVER")).toBeVisible({ timeout: 60_000 });
    await downButton.dispatchEvent("touchend");
    await expect(page.getByRole("button", { name: "START" })).toBeVisible();
  });
});
