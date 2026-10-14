import { GetScoresResponse, ScoreEntry, GameId } from "@/app/lib/scores/types";

// Leaderboard fetch + parsing shared by the use<Game>Score hooks:
// each game only provides its own parseEntry for the shape it needs.
export async function fetchTopScores<T>(
  gameId: GameId,
  parseEntry: (entry: ScoreEntry) => T
): Promise<T[]> {
  const response = await fetch(`/bookmarks/api/scores?gameId=${gameId}`);
  const data: GetScoresResponse = await response.json();
  return data.scores ? data.scores.map(parseEntry) : [];
}
