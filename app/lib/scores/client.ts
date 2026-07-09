import { GetScoresResponse, ScoreEntry, GameId } from "@/app/lib/scores/types";

// Fetch + parseo de leaderboard compartido por los hooks use<Game>Score:
// cada juego solo aporta su propio parseEntry para el shape que necesita.
export async function fetchTopScores<T>(
  gameId: GameId,
  parseEntry: (entry: ScoreEntry) => T
): Promise<T[]> {
  const response = await fetch(`/bookmarks/api/scores?gameId=${gameId}`);
  const data: GetScoresResponse = await response.json();
  return data.scores ? data.scores.map(parseEntry) : [];
}
