import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_IDS, GetScoresResponse, ScoreEntry } from "@/app/lib/scores/types";
import { LINES_TARGET, TetrisAction } from "./useTetris";

export type LeaderboardEntry = {
  userId: string;
  timeMs: number;
  linesTarget: number;
};

export function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis
      .toString()
      .padStart(3, "0")}`;
  }
  return `${seconds}.${millis.toString().padStart(3, "0")}s`;
}

function parseLeaderboardEntry(entry: ScoreEntry): LeaderboardEntry {
  const linesTarget =
    typeof entry.gameConfig?.linesTarget === "number"
      ? entry.gameConfig.linesTarget
      : LINES_TARGET;
  if (typeof entry.gameConfig?.linesTarget === "number" || entry.score >= 1000) {
    return {
      userId: entry.userId ?? entry.username,
      timeMs: entry.score,
      linesTarget,
    };
  }
  const legacySeconds =
    typeof entry.gameConfig?.timer === "number" ? entry.gameConfig.timer : 0;
  return {
    userId: entry.userId ?? entry.username,
    timeMs: legacySeconds * 1000,
    linesTarget: entry.score,
  };
}

/**
 * Hook con toda la lógica de marcador (carga y guardado de puntuaciones).
 * No contiene nada de UI.
 */
export function useScore() {
  const [topScores, setTopScores] = useState<LeaderboardEntry[]>([]);
  const scoreSavedRef = useRef(false);

  const loadScores = useCallback(async () => {
    try {
      const response = await fetch(`/bookmarks/api/scores?gameId=${GAME_IDS.TETRIS}`);
      const data: GetScoresResponse = await response.json();
      if (response.ok && data.scores) {
        setTopScores(data.scores.map(parseLeaderboardEntry));
      }
    } catch {
      // silencioso: el marcador simplemente no se actualiza
    }
  }, []);

  // El tiempo final lo decide siempre el backend: reproduce la partida a
  // partir del seed y el log de acciones (app/lib/tetris/replay.ts) y solo
  // si llega de forma legal a LINES_TARGET calcula el tiempo con su propio
  // reloj. Devolvemos ese valor para que useTetris lo adopte como
  // elapsedMs final.
  const saveScore = useCallback(
    async (nonce: string, actions: TetrisAction[]): Promise<number | null> => {
      if (scoreSavedRef.current) return null;
      scoreSavedRef.current = true;
      try {
        const response = await fetch("/bookmarks/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameId: GAME_IDS.TETRIS,
            nonce,
            actions,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          await loadScores();
          return typeof data.score === "number" ? data.score : null;
        }
        scoreSavedRef.current = false;
        return null;
      } catch {
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