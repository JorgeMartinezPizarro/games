import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_IDS, ScoreEntry } from "@/app/lib/scores/types";
import { fetchTopScores } from "@/app/lib/scores/client";
import { formatTimeMs } from "@/app/lib/scores/format";
import { LINES_TARGET, TetrisAction } from "./useTetris";

export type LeaderboardEntry = {
  userId: string;
  timeMs: number;
  linesTarget: number;
};

export { formatTimeMs };

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

// Result of the game just confirmed by the backend: the time achieved in
// THAT round and its (1-based) position within the game's full ranking
// (not just the top 10) — not the player's all-time best, even if they
// already had a better saved position from before.
export type LastResult = {
  timeMs: number;
  rank: number;
  total: number;
};

/**
 * Hook with all the scoreboard logic (loading and saving scores).
 * Contains nothing UI-related.
 */
export function useScore() {
  const [topScores, setTopScores] = useState<LeaderboardEntry[]>([]);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const scoreSavedRef = useRef(false);

  const loadScores = useCallback(async (): Promise<LeaderboardEntry[]> => {
    try {
      const scores = await fetchTopScores(GAME_IDS.TETRIS, parseLeaderboardEntry);
      setTopScores(scores);
      return scores;
    } catch {
      // silent: the scoreboard simply doesn't update
      return [];
    }
  }, []);

  // The final time is always decided by the backend: it replays the game
  // from the seed and the action log (app/lib/tetris/replay.ts) and only if
  // it legally reaches LINES_TARGET does it compute the time with its own
  // clock. We return that value so useTetris adopts it as the final
  // elapsedMs. The same response already includes THIS specific game's
  // position in the full ranking (rank/total), computed by the backend on
  // the freshly inserted row — not the player's all-time best.
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
          const confirmed = typeof data.score === "number" ? data.score : null;
          await loadScores();
          if (confirmed !== null && typeof data.rank === "number" && typeof data.total === "number") {
            setLastResult({ timeMs: confirmed, rank: data.rank, total: data.total });
          }
          return confirmed;
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

  // Must be called when restarting the game to allow saving again
  const resetSaveGuard = useCallback(() => {
    scoreSavedRef.current = false;
    setLastResult(null);
  }, []);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  return { topScores, loadScores, saveScore, resetSaveGuard, lastResult };
}