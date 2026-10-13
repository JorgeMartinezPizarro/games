import type { CSSProperties } from "react";
import styles from "./Words.module.css";

export type SegmentState = "ok" | "bad" | "now" | "todo";
export type AnswerState = "idle" | "correct" | "wrong" | "reveal" | "dim";

// Una barra por ronda: verde acertada, roja fallada, la actual parpadea.
export function RoundProgress({ segments }: { segments: SegmentState[] }) {
  return (
    <div className={styles.progress} aria-hidden>
      {segments.map((state, i) => (
        <span key={i} className={styles.segment} data-state={state} />
      ))}
    </div>
  );
}

const BARS = [22, 44, 70, 52, 30, 58, 26];

// Botón grande para volver a escuchar; la onda se mueve mientras suena.
export function ListenOrb({ playing, onReplay }: { playing: boolean; onReplay: () => void }) {
  return (
    <button
      type="button"
      className={styles.orb}
      data-playing={playing}
      onClick={onReplay}
      aria-label="Volver a escuchar la palabra"
    >
      <span className={styles.wave}>
        {BARS.map((height, i) => (
          <i key={i} style={{ "--h": `${height}px`, "--d": `${i * 90}ms` } as CSSProperties} />
        ))}
      </span>
    </button>
  );
}

export function AnswerGrid({
  choices,
  states,
  disabled,
  onChoice,
}: {
  choices: string[];
  states: AnswerState[];
  disabled: boolean;
  onChoice: (choice: string) => void;
}) {
  return (
    <div className={styles.answers}>
      {choices.map((choice, i) => (
        <button
          key={choice}
          type="button"
          className={styles.answer}
          data-state={states[i]}
          data-testid="answer"
          disabled={disabled}
          onClick={() => onChoice(choice)}
        >
          <span className={styles.key} aria-hidden>
            {i + 1}
          </span>
          {choice}
        </button>
      ))}
    </div>
  );
}
