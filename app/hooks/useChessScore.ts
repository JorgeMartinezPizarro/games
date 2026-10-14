"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_IDS, ScoreEntry } from "@/app/lib/scores/types";
import { fetchTopScores } from "@/app/lib/scores/client";

export type ChessScoreEntry = {
  elo: number;
  time: string;
  userId: string;
};

// Position of THIS specific game (not the player's all-time best) in the
// game's full ranking (not just the top 10).
export type MyRank = { rank: number; total: number };

function parseScoreEntry(entry: ScoreEntry): ChessScoreEntry {
  return {
    elo: entry.score,
    time: entry.createdAt,
    userId: entry.userId ?? entry.username,
  };
}

/**
 * Hook with all the chess scoreboard logic (loading and saving scores).
 * Contains nothing about the UI or the game rules.
 */
export function useChessScore() {
  const [topScores, setTopScores] = useState<ChessScoreEntry[]>([]);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const scoreSavedRef = useRef(false);

  const loadScores = useCallback(async () => {
    setScoreError(null);
    try {
      setTopScores(await fetchTopScores(GAME_IDS.CHESS, parseScoreEntry));
    } catch (error) {
      console.error("Error loading scores:", error);
      setScoreError("Couldn't load the scores.");
    }
  }, []);

  // The client no longer sends the score, only the game's nonce: the server
  // replays the move log stored under that nonce (recorded move by move by
  // /api/chess) and computes the score itself from the elo the game was
  // actually played at.
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
          throw new Error(errorData.error || "Couldn't save the score.");
        }
        const data = await response.json();
        await loadScores();
        // The POST itself already returns THIS game's position in the full
        // ranking (not the player's all-time best).
        if (typeof data.rank === "number" && typeof data.total === "number") {
          setMyRank({ rank: data.rank, total: data.total });
        }
        return true;
      } catch (error) {
        console.error("Error saving score:", error);
        setScoreError("Couldn't save your score. Try again.");
        scoreSavedRef.current = false;
        return false;
      }
    },
    [loadScores]
  );

  // Must be called when restarting the game to allow saving again
  const resetSaveGuard = useCallback(() => {
    scoreSavedRef.current = false;
    setMyRank(null);
  }, []);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  return { topScores, scoreError, myRank, loadScores, saveScore, resetSaveGuard };
}
