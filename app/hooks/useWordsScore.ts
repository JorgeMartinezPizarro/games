"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_IDS } from "@/app/lib/scores/types";
import { fetchTopScores } from "@/app/lib/scores/client";
import { estimateWordsTimeMs } from "@/app/lib/words/scoring";
import { ROUNDS_TOTAL, WordsSaveResult } from "./useWordsGame";

export type WordsScoreEntry = {
  score: number;
  userId: string;
  wordsTotal: number;
  correctAnswers: number;
  // Server-measured game time. Games saved before it was stored only have
  // an estimate derived from the score (timeEstimated).
  timeMs: number | null;
  timeEstimated: boolean;
  createdAt?: string;
};

export function formatMs(ms: number): string {
  return ms < 60000
    ? `${(ms / 1000).toFixed(3)}s`
    : `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(3)}s`;
}

// Leaderboard time: exact to the ms, or "≈" with tenths when it was estimated
// (the score's rounding makes the ms meaningless).
export function formatWordsTime(entry: Pick<WordsScoreEntry, "timeMs" | "timeEstimated">): string {
  if (entry.timeMs === null) return "—";
  if (!entry.timeEstimated) return formatMs(entry.timeMs);
  const tenths = Math.round(entry.timeMs / 100) * 100;
  return `≈${formatMs(tenths).replace(/(\.\d)00s$/, "$1s")}`;
}

/**
 * Hook with all the Wording scoreboard logic (loading and saving scores).
 * Contains nothing about the UI or the game rules.
 */
export function useWordsScore() {
  const [topScores, setTopScores] = useState<WordsScoreEntry[]>([]);
  const scoreSavedRef = useRef(false);

  const loadScores = useCallback(async (): Promise<WordsScoreEntry[]> => {
    try {
      const mapped = await fetchTopScores(GAME_IDS.WORDS, (s) => {
        const correctAnswers = (s.gameConfig?.correctAnswers as number | undefined) ?? 0;
        const storedTime = s.gameConfig?.timeMs;
        const timeEstimated = typeof storedTime !== "number";
        return {
          score: s.score,
          userId: s.userId ?? s.username,
          wordsTotal: (s.gameConfig?.wordsTotal as number | undefined) ?? ROUNDS_TOTAL,
          correctAnswers,
          timeMs: timeEstimated ? estimateWordsTimeMs(correctAnswers, s.score) : storedTime,
          timeEstimated,
          createdAt: s.createdAt,
        };
      });
      setTopScores(mapped);
      return mapped;
    } catch (e) {
      console.error("Error loading scores:", e);
    }
    return [];
  }, []);

  // The final score is always computed by the backend (nonce created in
  // /api/words/new-game, each round validated in /api/words/answer): this
  // only confirms the game and adopts the score and position the server
  // returns. Any finished game scores, won or lost.
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

        // The POST itself already returns THIS game's position in the full
        // ranking (not the player's all-time best).
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

  // Must be called when restarting the game to allow saving again
  const resetSaveGuard = useCallback(() => {
    scoreSavedRef.current = false;
  }, []);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  return { topScores, loadScores, saveScore, resetSaveGuard };
}
