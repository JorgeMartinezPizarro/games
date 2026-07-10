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

    // Los números quedan ocultos hasta pulsar PLAY (ver page.tsx): el
    // tablero real se pide a /api/numbers/new-game (con Docker real) solo
    // al pulsar el botón.
    await expect(page.locator('[data-testid="play-btn"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-testid="play-btn"]').click();

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

  // El test anterior deja un único score (1 paso) en un leaderboard que
  // empieza vacío (ver global-setup.ts): cualquier partida con más pasos lo
  // bate. Encadenamos unos cuantos saltos válidos de verdad (mismo cálculo
  // de vecinos que arriba, aplicado paso a paso) para conseguir un score
  // mayor y comprobar el resaltado de récord (fondo dorado) y el "Tu
  // posición: #1" reales, no solo que el score se guarda.
  test("una partida con más pasos bate el récord anterior y queda resaltada en el ranking", async ({
    page,
  }) => {
    await page.goto("/bookmarks/pages/games/numbers");

    await expect(page.locator('[data-testid="play-btn"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-testid="play-btn"]').click();
    await expect(page.locator('[data-testid="cell-0"]')).toBeVisible({ timeout: 15_000 });

    const saveScoreResponse = page.waitForResponse(
      (res) => res.url().includes("/bookmarks/api/scores") && res.request().method() === "POST"
    );

    await page.locator('[data-testid="cell-0"]').click();
    await expect(page.locator('[data-testid="steps-value"]')).toHaveText("1");

    // Encadena saltos válidos leyendo, en cada celda, su número real y
    // calculando sus dos vecinos legales (misma fórmula que isBlocked en
    // useNumbers.ts), evitando revisitar. Si un tablero concreto topara con
    // un callejón sin salida antes, la partida ya habría terminado sola
    // (💀) y el bucle simplemente no seguiría forzando más clics.
    const visited = new Set([0]);
    let lastIndex = 0;
    const TARGET_STEPS = 3;

    for (let step = 2; step <= TARGET_STEPS; step++) {
      if (await page.getByText("💀").isVisible()) break;

      const jump = Number(await page.locator(`[data-testid="cell-${lastIndex}"]`).innerText());
      const candidates = [(lastIndex + jump) % BOARD_SIZE, (lastIndex - jump + BOARD_SIZE) % BOARD_SIZE];
      const next = candidates.find((c) => !visited.has(c));
      if (next === undefined) break;

      await page.locator(`[data-testid="cell-${next}"]`).click();
      visited.add(next);
      lastIndex = next;
    }

    const stepsSoFar = Number(await page.locator('[data-testid="steps-value"]').innerText());
    expect(stepsSoFar).toBeGreaterThan(1);

    // Si la partida no ha terminado sola, se fuerza la derrota con un clic
    // deliberadamente inválido: una celda ni visitada ni alcanzable desde
    // la posición actual (mismo truco que en el test anterior).
    if (!(await page.getByText("💀").isVisible())) {
      const jumpLast = Number(await page.locator(`[data-testid="cell-${lastIndex}"]`).innerText());
      const validFromLast = new Set([
        (lastIndex + jumpLast) % BOARD_SIZE,
        (lastIndex - jumpLast + BOARD_SIZE) % BOARD_SIZE,
      ]);
      let wrongIndex = 0;
      while (visited.has(wrongIndex) || validFromLast.has(wrongIndex)) wrongIndex++;
      await page.locator(`[data-testid="cell-${wrongIndex}"]`).click();
    }

    await expect(page.getByText("💀")).toBeVisible();

    const response = await saveScoreResponse;
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.score).toBeGreaterThan(0);

    // Nueva posición #1 (bate el récord del test anterior) reflejada en la UI real.
    await expect(page.getByText(/Tu posición: #1 de/)).toBeVisible();
    await expect(page.locator(".center-panel-rank-top10")).toBeVisible();

    // La fila de este score en "Highest Scores" queda resaltada en dorado (récord real).
    await page.getByRole("button", { name: /SCORES/ }).click();
    const highestScoresTable = page.locator("table").first();
    const targetRow = highestScoresTable.locator("tbody tr").filter({
      has: page.locator("td", { hasText: new RegExp(`^${body.score}$`) }),
    });
    await expect(targetRow.first()).toHaveCSS("background-color", "rgb(255, 196, 0)");

    // La portada (app/page.tsx) también debe cargar este score recién
    // jugado en el botón de Numbers, no solo el ranking del propio juego.
    await page.goto("/bookmarks");
    const numbersBadge = page
      .locator(".MuiCard-root", { hasText: "Numbers" })
      .locator(".MuiTypography-caption");
    await expect(numbersBadge).not.toHaveText("Sin registro", { timeout: 15_000 });
    const badgeMatch = (await numbersBadge.innerText()).match(/([\d.,]+)\s*·\s*#(\d+)/);
    expect(Number(badgeMatch?.[1].replace(/[^\d]/g, ""))).toBe(body.score);
    expect(Number(badgeMatch?.[2])).toBe(1);
  });
});
