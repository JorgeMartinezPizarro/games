"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_IDS, ScoreEntry } from "@/app/lib/scores/types";
import { fetchTopScores } from "@/app/lib/scores/client";

export type ChessScoreEntry = {
  elo: number;
  time: string;
  userId: string;
};

function parseScoreEntry(entry: ScoreEntry): ChessScoreEntry {
  return {
    elo: entry.score,
    time: entry.createdAt,
    userId: entry.userId ?? entry.username,
  };
}

/**
 * Hook con toda la lógica de marcador de ajedrez (carga y guardado de
 * puntuaciones). No contiene nada de UI ni de las reglas del juego.
 */
export function useChessScore() {
  const [topScores, setTopScores] = useState<ChessScoreEntry[]>([]);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const scoreSavedRef = useRef(false);

  const loadScores = useCallback(async () => {
    setScoreError(null);
    try {
      setTopScores(await fetchTopScores(GAME_IDS.CHESS, parseScoreEntry));
    } catch (error) {
      console.error("Error loading scores:", error);
      setScoreError("No se pudieron cargar las puntuaciones.");
    }
  }, []);

  // El score ya no lo manda el cliente, solo el nonce de la partida: el
  // servidor reproduce el log de jugadas guardado bajo ese nonce (grabado
  // jugada a jugada por /api/chess) y calcula el score él mismo a partir
  // del elo con el que realmente se jugó.
  const saveScore = useCallback(
    async (nonce: string): Promise<boolean> => {
      if (scoreSavedRef.current) return false;
      scoreSavedRef.current = true;
      setScoreError(null);
      try {
        const response = await fetch("/bookmarks/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId: GAME_IDS.CHESS, nonce }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Error al guardar la puntuación");
        }
        await loadScores();
        return true;
      } catch (error) {
        console.error("Error saving score:", error);
        setScoreError("No se pudo guardar la puntuación. Inténtalo de nuevo.");
        scoreSavedRef.current = false;
        return false;
      }
    },
    [loadScores]
  );

  // Se debe llamar al reiniciar partida para permitir guardar de nuevo
  const resetSaveGuard = useCallback(() => {
    scoreSavedRef.current = false;
  }, []);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  return { topScores, scoreError, loadScores, saveScore, resetSaveGuard };
}
