import { GetPlayerScoresResponse, GetScoresResponse, ScoreEntry, GameId } from "@/app/lib/scores/types";

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

export type MyRank = {
  rank: number;
  total: number;
  bestScore: number;
};

// Posición exacta del jugador en el ranking completo de un juego (no
// limitada al top 100 de fetchTopScores/getScoresForGame), vía
// getPlayerBestScoreForGame. Siempre refleja su MEJOR puntuación histórica,
// no necesariamente la de la partida recién jugada.
export async function fetchMyRank(gameId: GameId): Promise<MyRank | null> {
  try {
    const response = await fetch(`/bookmarks/api/scores?me=true&gameId=${gameId}`);
    if (!response.ok) return null;
    const data: GetPlayerScoresResponse = await response.json();
    const best = data.games?.[0];
    if (!best || !best.found || best.rank == null || best.total == null || best.score == null) {
      return null;
    }
    return { rank: best.rank, total: best.total, bestScore: best.score };
  } catch {
    return null;
  }
}
