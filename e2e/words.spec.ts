import { expect, test } from "@playwright/test";
import { gamingActivities } from "./nextcloud";

const ROUNDS_TOTAL = 10;

// Any game that finishes now scores, win or lose (see
// app/api/scores/route.ts#saveWordsScore): there's no need to blindly get all
// 10 rounds right to have a score to check. We always pick the first option
// of each real round (audio + 4 options served by the real wordlist
// container) until the game ends, either by a mistake or by completing them
// all.
test.describe("Words", () => {
  test("a real game (won or lost) saves the score and shows up on the leaderboard", async ({
    page,
  }) => {
    await page.goto("/bookmarks/pages/games/words");

    const newGamePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/bookmarks/api/words/new-game") && res.request().method() === "POST"
    );
    await page.getByRole("button", { name: /^Play$/ }).click();
    const newGameResponse = await newGamePromise;
    expect(newGameResponse.ok()).toBe(true);

    const saveScoreResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/bookmarks/api/scores") && res.request().method() === "POST"
    );

    const resultTitle = page.getByTestId("result-title");
    const answer = page.getByTestId("answer").first();
    const enabledAnswer = page.locator('[data-testid="answer"]:not([disabled])').first();

    for (let round = 0; round < ROUNDS_TOTAL; round++) {
      // Wait for the next real state instead of a fixed pause: either a round
      // ready to answer (the first one includes loading the 10 audio clips) or
      // the result card. After a wrong answer the card only shows up once the
      // server has confirmed the score, which can take longer than the
      // component's 500ms feedback pause.
      await expect(enabledAnswer.or(resultTitle)).toBeVisible({ timeout: 20_000 });
      if (await resultTitle.isVisible()) break;

      await enabledAnswer.click();
      // Answers are disabled during the feedback pause; wait for that so the
      // next iteration doesn't click the same round twice. If the round ended
      // the game, the buttons are gone instead.
      await expect(answer).toBeDisabled({ timeout: 5_000 }).catch(() => {});
    }

    await expect(resultTitle).toHaveText(/Completed!|Game over/, { timeout: 20_000 });

    // The real backend (Docker) computes and saves the final score.
    const saveScoreResponse = await saveScoreResponsePromise;
    expect(saveScoreResponse.ok()).toBe(true);
    const body = await saveScoreResponse.json();
    expect(typeof body.score).toBe("number");
    expect(body.score).toBeGreaterThanOrEqual(0);

    // Empty leaderboard at the start of the suite (see global-setup.ts): this
    // is the first words game, so it's a record by definition (#1 of 1) —
    // the real notice is checked, not just that the score was saved.
    await expect(page.getByText(/Your rank: #1 of 1/)).toBeVisible();
    await expect(page.getByTestId("rank")).toHaveAttribute("data-top10", "true");

    // The validated score reaches the real Nextcloud gaming app, signed, as
    // an activity with a deeplink to the game.
    const [activity] = await gamingActivities(page.request);
    expect(activity?.subject).toMatch(new RegExp(`scored ${body.score} in Words$`));
    expect(activity?.link).toMatch(/\/apps\/gaming\/pages\/games\/words$/);

    // The saved score shows up on the real leaderboard (same session, it reloads by itself).
    await page.getByRole("button", { name: "View leaderboard" }).click();
    await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();

    const targetRow = page.getByTestId("leaderboard").locator("tbody tr").filter({
      has: page.locator("td", { hasText: new RegExp(`^${body.score}$`) }),
    });
    await expect(targetRow.first()).toBeVisible();

    // The home page (app/page.tsx) must also load this just-played score
    // into the Words card, not only the game's own leaderboard.
    await page.goto("/bookmarks");
    const wordingBadge = page.getByTestId("best-words");
    // "not No score yet" is not enough: while useBestScores loads, the badge
    // shows "…" (which isn't "No score yet" either), so we really have to
    // wait for the final "<score> · #<rank>" pattern, not just for a change.
    const scorePattern = /[\d.,]+\s*·\s*#\d+/;
    await expect(wordingBadge).toHaveText(scorePattern, { timeout: 15_000 });
    const badgeMatch = (await wordingBadge.innerText()).match(/([\d.,]+)\s*·\s*#(\d+)/);
    expect(Number(badgeMatch?.[1].replace(/[^\d]/g, ""))).toBe(body.score);
    expect(Number(badgeMatch?.[2])).toBe(1);
  });
});
