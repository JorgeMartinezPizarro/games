import { expect, test } from "@playwright/test";

const BOARD_SIZE = 20;

// Numbers is the only one of the 4 games whose save endpoint accepts an
// incomplete game (see app/api/scores/route.ts#saveNumbersScore): it's enough
// for the steps played to be legal, the board doesn't have to be completed.
// That's why it's the natural candidate for a "real loss with a checkable
// score" — in chess/words/tetris a score is only saved on a win.
test.describe("Numbers", () => {
  test("a real game ends in a loss and the score is saved and visible on the leaderboard", async ({
    page,
  }) => {
    await page.goto("/bookmarks/pages/games/numbers");

    // The numbers stay hidden until PLAY is pressed (see page.tsx): the real
    // board is requested from /api/numbers/new-game (with real Docker) only
    // when the button is pressed.
    await expect(page.locator('[data-testid="play-btn"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-testid="play-btn"]').click();

    await expect(page.locator('[data-testid="cell-0"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid^="cell-"]')).toHaveCount(BOARD_SIZE);

    // The first click is always valid; we read cell 0's real jump to
    // deliberately pick a second cell that is NOT reachable from there, and
    // so force a deterministic loss on the second click.
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

    // Loss reflected in the real UI ("Game over" state of the center scoreboard).
    await expect(page.getByTestId("status")).toBeVisible();
    await expect(page.locator('[data-testid="steps-value"]')).toHaveText("1");

    // The real backend (Docker) validates the step and computes/saves the score.
    const response = await saveScoreResponse;
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(typeof body.score).toBe("number");
    expect(body.score).toBeGreaterThan(0);

    // The saved score shows up on the real leaderboard (same session, it reloads by itself).
    await page.getByRole("button", { name: "Leaderboard" }).click();
    await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();

    // A single table, ranked by points: we find the row whose Points cell
    // matches EXACTLY the score the backend confirmed, and check that its
    // Steps column (last cell) is 1.
    const highestScoresTable = page.locator("table").first();
    const targetRow = highestScoresTable.locator("tbody tr").filter({
      has: page.locator("td", { hasText: new RegExp(`^${body.score}$`) }),
    });
    await expect(targetRow.first()).toBeVisible();
    await expect(targetRow.first().locator("td").last()).toHaveText("1");
  });

  // The previous test leaves a single score (1 step) on a leaderboard that
  // starts empty (see global-setup.ts): any game with more steps beats it.
  // We chain a few genuinely valid jumps (same neighbor calculation as
  // above, applied step by step) to get a higher score and check the real
  // record highlight (gold background) and "Your rank: #1", not just that
  // the score is saved.
  test("a game with more steps beats the previous record and is highlighted on the leaderboard", async ({
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

    // Chains valid jumps by reading each cell's real number and computing
    // its two legal neighbors (same formula as isBlocked in useNumbers.ts),
    // avoiding revisits. If a particular board hit a dead end earlier, the
    // game would already have ended on its own ("Game over") and the loop
    // simply wouldn't keep forcing more clicks.
    const visited = new Set([0]);
    let lastIndex = 0;
    const TARGET_STEPS = 3;

    for (let step = 2; step <= TARGET_STEPS; step++) {
      if (await page.getByTestId("status").isVisible()) break;

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

    // If the game hasn't ended on its own, force the loss with a
    // deliberately invalid click: a cell neither visited nor reachable from
    // the current position (same trick as in the previous test).
    if (!(await page.getByTestId("status").isVisible())) {
      const jumpLast = Number(await page.locator(`[data-testid="cell-${lastIndex}"]`).innerText());
      const validFromLast = new Set([
        (lastIndex + jumpLast) % BOARD_SIZE,
        (lastIndex - jumpLast + BOARD_SIZE) % BOARD_SIZE,
      ]);
      let wrongIndex = 0;
      while (visited.has(wrongIndex) || validFromLast.has(wrongIndex)) wrongIndex++;
      await page.locator(`[data-testid="cell-${wrongIndex}"]`).click();
    }

    await expect(page.getByTestId("status")).toBeVisible();

    const response = await saveScoreResponse;
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.score).toBeGreaterThan(0);

    // New #1 rank (beats the previous test's record) reflected in the real UI.
    await expect(page.getByText(/Your rank: #1 of/)).toBeVisible();
    await expect(page.getByTestId("rank")).toHaveAttribute("data-top10", "true");

    // This score's row in the leaderboard is highlighted as a real record.
    await page.getByRole("button", { name: "Leaderboard" }).click();
    const highestScoresTable = page.locator("table").first();
    const targetRow = highestScoresTable.locator("tbody tr").filter({
      has: page.locator("td", { hasText: new RegExp(`^${body.score}$`) }),
    });
    await expect(targetRow.first()).toHaveAttribute("data-record", "true");

    // The home page (app/page.tsx) must also load this just-played score
    // into the Numbers card, not only the game's own leaderboard.
    await page.goto("/bookmarks");
    const numbersBadge = page.getByTestId("best-numbers");
    // "not No score yet" is not enough: while useBestScores loads, the badge
    // shows "…" (which isn't "No score yet" either), so we really have to
    // wait for the final "<score> · #<rank>" pattern, not just for a change.
    const scorePattern = /[\d.,]+\s*·\s*#\d+/;
    await expect(numbersBadge).toHaveText(scorePattern, { timeout: 15_000 });
    const badgeMatch = (await numbersBadge.innerText()).match(/([\d.,]+)\s*·\s*#(\d+)/);
    expect(Number(badgeMatch?.[1].replace(/[^\d]/g, ""))).toBe(body.score);
    expect(Number(badgeMatch?.[2])).toBe(1);
  });
});
