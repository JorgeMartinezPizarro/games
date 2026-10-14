import { devices, expect, test } from "@playwright/test";

// Tetris only saves a score if the replay reaches LINES_TARGET (25 lines) —
// actually completing that requires a real stacking strategy, out of scope
// for a smoke test. Instead: real keyboard moves (they exercise the real
// integration with the server seed) and then S is held down (real soft drop,
// the same listener useTetris tested in the unit tests) without moving the
// spawn column any further, until pieces stack up and reach a real game
// over, with no test shortcut at all.
test.describe("Tetris", () => {
  test("can be played with a real keyboard and the game ends in a real game over", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto("/bookmarks/pages/games/tetris");

    await page.getByRole("button", { name: /^Play/ }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible({ timeout: 15_000 });

    const linesBefore = await page.getByTestId("lines").innerText();
    expect(linesBefore).toContain("0/25");

    // Real keyboard controls (the same listeners useTetris tested in the
    // unit tests): move, rotate and force a fast drop.
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("o"); // rotate left
    await page.keyboard.press("p"); // rotate right

    // Holding S down speeds up the fall (soft drop repeated every 100ms,
    // HOLD_REPEAT_RATE in useTetris.ts) compared to natural gravity
    // (184ms/row, DROP_SPEED_MS): without moving the spawn column any further,
    // this stacks pieces and reaches a real game over well before releasing
    // the key and waiting for gravity alone would.
    await page.keyboard.down("s");
    await expect(page.getByTestId("result-title")).toHaveText("Game over", { timeout: 60_000 });
    await page.keyboard.up("s");
    await expect(page.getByRole("button", { name: /^Play/ })).toBeVisible();
  });
});

// The touch controls (TouchControls) are only shown in the mobile layout
// (see Tetris.module.css: max-width 768px or hover:none+pointer:coarse), so
// we need to emulate a real mobile viewport (Pixel 7, hasTouch) for them to
// render and to check that the game can also be played by touch, not only
// with the keyboard.
test.describe("Tetris (mobile)", () => {
  // defaultBrowserType is excluded on purpose: setting it inside a describe
  // (instead of at project level) forces a new worker and Playwright rejects
  // it; the project already uses chromium, so it isn't needed.
  const { defaultBrowserType: _defaultBrowserType, ...pixel7 } = devices["Pixel 7"];
  test.use({ ...pixel7 });

  test("can be played with the touch controls and the game ends in a real game over", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto("/bookmarks/pages/games/tetris");

    await page.getByRole("button", { name: /^Play/ }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible({ timeout: 15_000 });

    const linesBefore = await page.getByTestId("lines").innerText();
    expect(linesBefore).toContain("0/25");

    // Same real controls as the keyboard test, but fired by touch (the same
    // startRepeat/moveLeft/moveRight/rotateLeft/rotateRight that useTetris
    // also exposes to the keyboard): move and rotate.
    await page.getByRole("button", { name: "Left (A)" }).tap();
    await page.getByRole("button", { name: "Right (D)" }).tap();
    await page.getByRole("button", { name: "Rotate left (O)" }).tap();
    await page.getByRole("button", { name: "Rotate right (P)" }).tap();

    // Holding the down button (real touchstart, no touchend yet) speeds up
    // the fall just like holding S on the keyboard: without moving the spawn
    // column any further, this stacks pieces until a real game over.
    const downButton = page.getByRole("button", { name: "Down (S)" });
    await downButton.dispatchEvent("touchstart");
    await expect(page.getByTestId("result-title")).toHaveText("Game over", { timeout: 60_000 });
    await downButton.dispatchEvent("touchend");
    await expect(page.getByRole("button", { name: /^Play/ })).toBeVisible();
  });
});
