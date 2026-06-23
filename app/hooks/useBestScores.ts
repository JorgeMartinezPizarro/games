"use client";

import { useCallback, useEffect, useState } from "react";
import { formatTimeMs } from "./useTetrisScore";

export type GameId = 1 | 2 | 3 | 4;

type PlayerGameBest = {
  gameId: GameId;
  gameName: string;
  found: boolean;
  score: number | null;
  rank: number | null;
  gameConfig: Record<string, unknown> | null;
  createdAt: string | null;
};

type GetPlayerScoresResponse = {
  username: string;
  games: PlayerGameBest[];
};

// Juegos cuyo score es un tiempo en ms (menor es mejor): Tetris (3) y Wording (4)
const TIME_BASED_GAMES = new Set<GameId>([3, 4]);

export function formatGameScore(gameId: GameId, score: number): string {
  return TIME_BASED_GAMES.has(gameId) ? formatTimeMs(score) : score.toLocaleString();
}

export function useBestScores() {
  const [games, setGames] = useState<PlayerGameBest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/bookmarks/api/scores?me=true`);
      if (!res.ok) {
        // Sin sesión válida (login activo) o cualquier otro error:
        // no rompemos la UI, simplemente no mostramos badges.
        setGames([]);
        return;
      }
      const data: GetPlayerScoresResponse = await res.json();
      setGames(data.games || []);
    } catch (error) {
      console.error("Error loading my scores:", error);
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { games, loading, reload: load };
}