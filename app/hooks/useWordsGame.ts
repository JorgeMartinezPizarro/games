"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const ROUNDS_TOTAL = 10;
export const CHOICES = 4;

// The backend never sends the target: only audio + choices. Each round's
// correctness is validated at /api/words/answer, one at a time and single-use.
export type Round = {
  audio: string;
  choices: string[];
};

export type WordsGameState = "idle" | "loading" | "playing" | "finished";

export type WordsSaveResult = { score: number; rank: number | null; total: number | null };

// Local estimate using the same formula as the server
// (computeWordsScore in app/lib/words/scoring.ts), to show something
// reasonable while the real score is confirmed via onComplete.
function estimateScore(correctAnswers: number, elapsedMs: number): number {
  return elapsedMs <= 0 ? 0 : Math.round((correctAnswers ** 3 * 11000) / elapsedMs);
}

export interface UseWordsGameOptions {
  /**
   * Called exactly once when the ROUNDS_TOTAL rounds are completed, with
   * the game's nonce so the backend can confirm it and compute the score.
   * If it returns a result, it is adopted as the final time/position.
   */
  onComplete?: (nonce: string) => Promise<WordsSaveResult | null> | WordsSaveResult | null;
  /** Called every time a new game starts. */
  onReset?: () => void;
}

// Preloads an audio file in the browser (not just on the server) so the
// first playback of each round is instant. It doesn't block the game
// indefinitely if a file is slow or fails.
function preloadAudio(url: string, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("canplaythrough", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    audio.src = url;
    audio.load();
    setTimeout(done, timeoutMs);
  });
}

export function useWordsGame({ onComplete, onReset }: UseWordsGameOptions = {}) {
  const [gameState, setGameState] = useState<WordsGameState>("idle");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [won, setWon] = useState(false); // true = completed all 10
  const [quit, setQuit] = useState(false); // true = ended manually by the player
  const [finishedTime, setFinishedTime] = useState<number | null>(null);
  // Final score (hits cubed divided by time, same as numbers): only filled
  // in when winning or losing a round, never when ending with "quit".
  const [finishedScore, setFinishedScore] = useState<number | null>(null);
  const [finishedRank, setFinishedRank] = useState<number | null>(null);
  const [finishedTotal, setFinishedTotal] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [pickedChoice, setPickedChoice] = useState<string | null>(null);
  const [revealedTarget, setRevealedTarget] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [nonce, setNonce] = useState<string | null>(null);

  const startTimeRef = useRef<number>(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Timer
  useEffect(() => {
    if (gameState === "playing") {
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState]);

  // Autoplay when the round changes
  useEffect(() => {
    if (gameState === "playing" && rounds[currentRound]) {
      setTimeout(() => {
        audioRef.current?.play().catch((e) => console.warn("autoplay blocked:", e));
      }, 80);
    }
  }, [currentRound, gameState, rounds]);

  // Start a game
  const startGame = useCallback(async () => {
    setGameState("loading");
    setScore(0);
    setWon(false);
    setCurrentRound(0);
    setFinishedTime(null);
    setFinishedScore(null);
    setFinishedRank(null);
    setFinishedTotal(null);
    setFeedback(null);
    setPickedChoice(null);
    setRevealedTarget(null);
    setNonce(null);
    setQuit(false);
    onReset?.();

    try {
      const res = await fetch(
        `/bookmarks/api/words/new-game?rounds=${ROUNDS_TOTAL}&choices=${CHOICES}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok || !data.rounds?.length) throw new Error("No rounds received");

      // The timer starts as soon as the server creates the game (the same
      // instant it will use to compute the final time), not when the audio
      // finishes preloading.
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      setNonce(data.nonce);
      setRounds(data.rounds);

      // Pre-caches the 10 audio files in the browser while the loading screen
      // is shown, so there's no network wait when playing each round.
      await Promise.all((data.rounds as Round[]).map((r) => preloadAudio(r.audio)));

      setGameState("playing");
    } catch (e) {
      console.error("Error loading challenge:", e);
      setGameState("idle");
    }
  }, [onReset]);

  // The player picks a word: it's validated against the backend, one round
  // at a time and with a single attempt (a miss ends the game right there).
  const handleChoice = useCallback(
    async (choice: string) => {
      if (gameState !== "playing" || feedback || checking || !nonce) return;

      setChecking(true);
      setPickedChoice(choice);

      try {
        const res = await fetch("/bookmarks/api/words/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nonce, roundIndex: currentRound, answer: choice }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Answer check failed");

        setChecking(false);

        if (!data.correct) {
          setRevealedTarget(typeof data.target === "string" ? data.target : null);
          setFeedback("wrong");

          setTimeout(async () => {
            setFeedback(null);
            const elapsed = Date.now() - startTimeRef.current;
            setFinishedTime(elapsed);
            setFinishedScore(estimateScore(score, elapsed));
            setWon(false);
            setGameState("finished");

            // Missing also scores: the hits achieved so far are saved (any
            // game that ends, won or lost, counts).
            const result = await onComplete?.(nonce);
            if (result) {
              setFinishedScore(result.score);
              setFinishedRank(result.rank);
              setFinishedTotal(result.total);
            }
          }, 500);
          return;
        }

        setFeedback("correct");

        setTimeout(async () => {
          setFeedback(null);
          setScore((s) => s + 1);

          if (data.finished) {
            const elapsed = Date.now() - startTimeRef.current;
            setFinishedTime(elapsed);
            setFinishedScore(estimateScore(score + 1, elapsed));
            setWon(true);
            setGameState("finished");

            const result = await onComplete?.(nonce);
            if (result) {
              setFinishedScore(result.score);
              setFinishedRank(result.rank);
              setFinishedTotal(result.total);
            }
          } else {
            setCurrentRound((c) => c + 1);
          }
        }, 500);
      } catch (e) {
        console.error("Error checking answer:", e);
        setChecking(false);
      }
    },
    [gameState, feedback, checking, nonce, currentRound, onComplete, score]
  );

  // The player decides to end the game early: it counts as an uncompleted
  // game, without saving a score.
  const handleQuit = useCallback(() => {
    if (gameState !== "playing") return;

    const elapsed = Date.now() - startTimeRef.current;
    setFinishedTime(elapsed);
    setQuit(true);
    setWon(false);
    setGameState("finished");
  }, [gameState]);

  // Replay audio
  const handleReplay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch((e) => console.warn("replay failed:", e));
  }, []);

  const round = rounds[currentRound];

  return {
    gameState,
    currentRound,
    score,
    won,
    quit,
    finishedTime,
    finishedScore,
    finishedRank,
    finishedTotal,
    feedback,
    pickedChoice,
    revealedTarget,
    checking,
    elapsedMs,
    audioRef,
    round,
    startGame,
    handleChoice,
    handleQuit,
    handleReplay,
  };
}
