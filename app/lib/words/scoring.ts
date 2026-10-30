// Same shape as numbers (computeNumbersScore in app/lib/numbers/board.ts):
// cube of the correct answers divided by the time taken, so that any game
// scores (even with few correct answers), rewarding speed more the more
// correct answers there are. The numerator constant is larger than in
// numbers: each Wording round takes quite a bit longer than a Numbers step,
// so it needs more weight to produce scores in a comparable range.
export function computeWordsScore(correctAnswers: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.round((correctAnswers ** 3 * 11000) / elapsedMs);
}

// Inverse of computeWordsScore, for games saved before the time was stored in
// gameConfig (timeMs). Only approximate: the score was rounded to an integer.
export function estimateWordsTimeMs(correctAnswers: number, score: number): number | null {
  if (correctAnswers <= 0 || score <= 0) return null;
  return Math.round((correctAnswers ** 3 * 11000) / score);
}
