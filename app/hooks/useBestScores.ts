"use client";

import { useCallback, useEffect, useState } from "react";
import { formatTimeMs } from "./useTetrisScore";
import type { GameId, GetPlayerScoresResponse, PlayerGameBest } from "@/app/lib/scores/types";

export type { GameId };

// Juegos cuyo score es un tiempo en ms (menor es mejor): solo Tetris (3).
// Wording (4) puntúa en puntos (cubo de aciertos entre tiempo, mayor es
// mejor), igual que Chess y Numbers.
const TIME_BASED_GAMES = new Set<GameId>([3]);

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