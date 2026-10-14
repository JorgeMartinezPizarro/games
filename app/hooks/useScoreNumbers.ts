"use client";

import { useCallback, useState } from "react";
import { CellValues, RecordEntry } from "@/app/types";
import { GAME_IDS, ScoreEntry } from "@/app/lib/scores/types";
import { fetchTopScores } from "@/app/lib/scores/client";
import { NumbersMove } from "@/app/lib/numbers/board";

// Position of THIS specific game (not the player's all-time best) in the
// game's full ranking (not just the top 10).
export type MyRank = { rank: number; total: number };

export type NumbersScoreEntry = {
  score: number;
  steps: number;
  userId: string;
  time: string;
};

function parseScoreEntry(entry: ScoreEntry): NumbersScoreEntry {
  return {
    score: entry.score,
    steps: (entry.gameConfig?.steps as number | undefined) || 0,
    userId: entry.userId ?? entry.username,
    time: entry.createdAt,
  };
}

export function useScoreNumbers() {
  const [topScores, setTopScores] = useState<NumbersScoreEntry[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  // Prevents duplicate submissions until the game is restarted
  const [scoreSaved, setScoreSaved] = useState(false);

  // Marks the row to highlight in the list when the score confirmed by the
  // backend beats the best score the leaderboard had so far.
  const [recordEntry, setRecordEntry] = useState<RecordEntry | null>(null);

  // Player's position in the full ranking (not just the top 10),
  // queried separately after saving the score.
  const [myRank, setMyRank] = useState<MyRank | null>(null);

  const loadScores = useCallback(async () => {
    setError(undefined);
    try {
      setTopScores(await fetchTopScores(GAME_IDS.NUMBERS, parseScoreEntry));
    } catch (e: any) {
      setError(e.message || "Error loading scores");
    }
  }, []);

  // The final score is always decided by the backend (recomputed from the
  // validated nonce/board/moves): this returns that value so useNumbers
  // updates what it shows on screen and both match.
  const saveScore = useCallback(
    async (
      _finalScore: number,
      finalSteps: number,
      moves: NumbersMove[],
      nonce: string | null,
      board: CellValues[]
    ): Promise<number | null> => {
      if (scoreSaved || !nonce) return null;

      try {
        const response = await fetch("/bookmarks/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameId: GAME_IDS.NUMBERS,
            nonce,
            board,
            moves,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          setError(errorBody?.error || "Couldn't save your score.");
          return null;
        }

        const data = await response.json();
        const confirmedScore = typeof data.score === "number" ? data.score : null;

        setScoreSaved(true);

        const previousBest = topScores.reduce((max, entry) => Math.max(max, entry.score), 0);
        if (confirmedScore !== null && confirmedScore > previousBest) {
          setRecordEntry({ score: confirmedScore, steps: finalSteps });
        }

        await loadScores();
        // The POST itself already returns THIS game's position in the full
        // ranking (computed on the freshly inserted row), not the player's
        // all-time best.
        if (confirmedScore !== null && typeof data.rank === "number" && typeof data.total === "number") {
          setMyRank({ rank: data.rank, total: data.total });
        }
        return confirmedScore;
      } catch (error) {
        console.error("Error saving score:", error);
        setError("Couldn't save your score.");
        return null;
      }
    },
    [scoreSaved, loadScores, topScores]
  );

  const resetScore = useCallback(() => {
    setScoreSaved(false);
    setRecordEntry(null);
    setMyRank(null);
  }, []);

  return { topScores, error, loadScores, saveScore, resetScore, recordEntry, myRank };
}
