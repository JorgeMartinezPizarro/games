"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_IDS } from "@/app/lib/scores/types";
import { fetchTopScores } from "@/app/lib/scores/client";
import { ROUNDS_TOTAL, WordsSaveResult } from "./useWordsGame";

export type WordsScoreEntry = {
  score: number;
  userId: string;
  wordsTotal: number;
  correctAnswers: number;
  createdAt?: string;
};

export function formatMs(ms: number): string {
  return ms < 60000
    ? `${(ms / 1000).toFixed(3)}s`
    : `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(3)}s`;
}

/**
 * Hook con toda la lógica de marcador de Wording (carga y guardado de
 * puntuaciones). No contiene nada de UI ni de las reglas del juego.
 */
export function useWordsScore() {
  const [topScores, setTopScores] = useState<WordsScoreEntry[]>([]);
  const scoreSavedRef = useRef(false);

  const loadScores = useCallback(async (): Promise<WordsScoreEntry[]> => {
    try {
      const mapped = await fetchTopScores(GAME_IDS.WORDS, (s) => ({
        score: s.score,
        userId: s.userId ?? s.username,
        wordsTotal: (s.gameConfig?.wordsTotal as number | undefined) ?? ROUNDS_TOTAL,
        correctAnswers: (s.gameConfig?.correctAnswers as number | undefined) ?? 0,
        createdAt: s.createdAt,
      }));
      setTopScores(mapped);
      return mapped;
    } catch (e) {
      console.error("Error loading scores:", e);
    }
    return [];
  }, []);

  // El score final lo calcula siempre el backend (nonce creado en
  // /api/words/new-game, cada ronda validada en /api/words/answer): esto
  // solo confirma la partida y adopta el score y puesto que devuelve el
  // servidor. Cualquier partida terminada puntúa, gane o pierda.
  const saveScore = useCallback(
    async (nonce: string): Promise<WordsSaveResult | null> => {
      if (scoreSavedRef.current) return null;
      scoreSavedRef.current = true;
      try {
        const res = await fetch("/bookmarks/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId: GAME_IDS.WORDS, nonce }),
        });
        const data = await res.json();
        if (!res.ok) {
          scoreSavedRef.current = false;
          return null;
        }

        await loadScores();
        const confirmedScore = typeof data.score === "number" ? data.score : null;
        if (confirmedScore === null) return null;

        // El propio POST ya trae la posición de ESTA partida en el ranking
        // completo (no el mejor histórico del jugador).
        return {
          score: confirmedScore,
          rank: typeof data.rank === "number" ? data.rank : null,
          total: typeof data.total === "number" ? data.total : null,
        };
      } catch (e) {
        console.error("Error saving score:", e);
        scoreSavedRef.current = false;
        return null;
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

  return { topScores, loadScores, saveScore, resetSaveGuard };
}
