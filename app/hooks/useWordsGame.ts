"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const ROUNDS_TOTAL = 10;
export const CHOICES = 4;

// El backend nunca manda el target: solo audio + choices. La corrección de
// cada ronda se valida en /api/words/answer, de una en una y de un solo uso.
export type Round = {
  audio: string;
  choices: string[];
};

export type WordsGameState = "idle" | "loading" | "playing" | "finished";

export type WordsSaveResult = { score: number; rank: number | null };

export interface UseWordsGameOptions {
  /**
   * Se llama una única vez cuando se completan las ROUNDS_TOTAL rondas, con
   * el nonce de la partida para que el backend la confirme y calcule el
   * score. Si devuelve un resultado, se adopta como tiempo/puesto final.
   */
  onComplete?: (nonce: string) => Promise<WordsSaveResult | null> | WordsSaveResult | null;
  /** Se llama cada vez que arranca una partida nueva. */
  onReset?: () => void;
}

// Precarga un audio en el navegador (no solo en el servidor) para que la
// primera reproducción de cada ronda sea instantánea. No bloquea el juego
// indefinidamente si un archivo tarda o falla.
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
  const [won, setWon] = useState(false); // true = completó las 10
  const [quit, setQuit] = useState(false); // true = terminada manualmente por el jugador
  const [finishedTime, setFinishedTime] = useState<number | null>(null);
  const [finishedRank, setFinishedRank] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [pickedChoice, setPickedChoice] = useState<string | null>(null);
  const [revealedTarget, setRevealedTarget] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [nonce, setNonce] = useState<string | null>(null);

  const startTimeRef = useRef<number>(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cronómetro
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

  // Autoplay cuando cambia la ronda
  useEffect(() => {
    if (gameState === "playing" && rounds[currentRound]) {
      setTimeout(() => {
        audioRef.current?.play().catch((e) => console.warn("autoplay blocked:", e));
      }, 80);
    }
  }, [currentRound, gameState, rounds]);

  // Iniciar partida
  const startGame = useCallback(async () => {
    setGameState("loading");
    setScore(0);
    setWon(false);
    setCurrentRound(0);
    setFinishedTime(null);
    setFinishedRank(null);
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

      // El cronómetro arranca en cuanto el servidor crea la partida (mismo
      // instante que usará para calcular el tiempo final), no cuando
      // termina de precargarse el audio.
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      setNonce(data.nonce);
      setRounds(data.rounds);

      // Precachea los 10 audios en el navegador mientras se ve la pantalla
      // de carga, para que no haya que esperar red al reproducir cada ronda.
      await Promise.all((data.rounds as Round[]).map((r) => preloadAudio(r.audio)));

      setGameState("playing");
    } catch (e) {
      console.error("Error loading challenge:", e);
      setGameState("idle");
    }
  }, [onReset]);

  // El jugador elige una palabra: se valida contra el backend, de una ronda
  // en una y de un solo intento (un fallo termina la partida ahí mismo).
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

          setTimeout(() => {
            setFeedback(null);
            const elapsed = Date.now() - startTimeRef.current;
            setFinishedTime(elapsed);
            setWon(false);
            setGameState("finished");
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
            setWon(true);
            setGameState("finished");

            const result = await onComplete?.(nonce);
            if (result) {
              setFinishedTime(result.score);
              setFinishedRank(result.rank);
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
    [gameState, feedback, checking, nonce, currentRound, onComplete]
  );

  // El jugador decide terminar la partida antes de tiempo: cuenta como
  // partida no completada, sin guardar puntuación.
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
    finishedRank,
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
