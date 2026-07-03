import { expect, test } from "@playwright/test";

const BOARD_SIZE = 20;

// Numbers es el único de los 4 juegos cuyo endpoint de guardado acepta una
// partida incompleta (ver app/api/scores/route.ts#saveNumbersScore): basta
// con que los pasos jugados sean legales, no hace falta completar el
// tablero. Por eso es el candidato natural para una "derrota real con
// score analizable" — en chess/words/tetris solo se guarda al ganar.
test.describe("Numbers", () => {
  test("una partida real termina en derrota y el score queda guardado y visible en el ranking", async ({
    page,
  }) => {
    await page.goto("/bookmarks/pages/games/numbers");

    // Tablero real servido por /api/numbers/new-game (con Docker real).
    await expect(page.locator('[data-testid="cell-0"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid^="cell-"]')).toHaveCount(BOARD_SIZE);

    // El primer clic siempre es válido; leemos el salto real de la celda 0
    // para elegir a propósito una segunda celda que NO sea alcanzable desde
    // ahí, y así forzar una derrota determinista en el segundo clic.
    const jump0 = Number(await page.locator('[data-testid="cell-0"]').innerText());
    const validFromZero = new Set([jump0 % BOARD_SIZE, (BOARD_SIZE - jump0) % BOARD_SIZE]);
    let wrongIndex = 1;
    while (wrongIndex === 0 || validFromZero.has(wrongIndex)) wrongIndex++;

    await page.locator('[data-testid="cell-0"]').click();
    await expect(page.locator('[data-testid="steps-value"]')).toHaveText("1");

    const saveScoreResponse = page.waitForResponse(
      (res) => res.url().includes("/bookmarks/api/scores") && res.request().method() === "POST"
    );

    await page.locator(`[data-testid="cell-${wrongIndex}"]`).click();

    // Derrota reflejada en la UI real (icono de calavera del estado !isRight).
    await expect(page.getByText("💀")).toBeVisible();
    await expect(page.locator('[data-testid="steps-value"]')).toHaveText("1");

    // El backend real (Docker) valida el paso y calcula/guarda el score.
    const response = await saveScoreResponse;
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(typeof body.score).toBe("number");
    expect(body.score).toBeGreaterThan(0);

    // El score guardado aparece en el ranking real (misma sesión, se recarga solo).
    await page.getByRole("button", { name: /SCORES/ }).click();
    await expect(page.getByText("Highest Scores")).toBeVisible();

    // La tabla "Highest Scores" es la primera; localizamos la fila cuya
    // celda de Score coincide EXACTO con el score que confirmó el backend,
    // y comprobamos que su columna Steps (última celda) sea 1.
    const highestScoresTable = page.locator("table").first();
    const targetRow = highestScoresTable.locator("tbody tr").filter({
      has: page.locator("td", { hasText: new RegExp(`^${body.score}$`) }),
    });
    await expect(targetRow.first()).toBeVisible();
    await expect(targetRow.first().locator("td").last()).toHaveText("1");
  });
});
