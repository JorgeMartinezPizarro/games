"use client";

import { useCallback, useEffect, useState } from "react";
import { formatTimeMs } from "./useTetrisScore";
import type { GameId, GetPlayerScoresResponse, PlayerGameBest } from "@/app/lib/scores/types";

export type { GameId };

// Games whose score is a time in ms (lower is better): only Tetris (3).
// Wording (4) scores in points (hits cubed divided by time, higher is
// better), same as Chess and Numbers.
const TIME_BASED_GAMES = new Set<GameId>([3]);

export function formatGameScore(gameId: GameId, score: number): string {
  return TIME_BASED_GAMES.has(gameId) ? formatTimeMs(score) : score.toLocaleString("en-US");
}

export function useBestScores() {
  const [games, setGames] = useState<PlayerGameBest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/bookmarks/api/scores?me=true`);
      if (!res.ok) {
        // No valid session (login enabled) or any other error:
        // don't break the UI, just don't show badges.
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