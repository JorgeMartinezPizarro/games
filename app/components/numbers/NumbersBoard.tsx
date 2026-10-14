import type { CSSProperties, ReactNode } from "react";
import type { CellValues } from "@/app/types";
import styles from "./Numbers.module.css";

const SIZE = 20;

// Position in the 6×6 grid of ring square i, clockwise from the top-left
// corner (same order as the server board).
export function ringPosition(i: number): { row: number; col: number } {
  if (i < 6) return { row: 1, col: i + 1 };
  if (i < 10) return { row: i - 4, col: 6 };
  if (i < 16) return { row: 6, col: 16 - i };
  return { row: 21 - i, col: 1 };
}

export type TileState = "free" | "visited" | "current" | "lost";

export function NumbersBoard({
  numbers,
  order,
  current,
  lost,
  loading,
  disabled,
  onCell,
  children,
}: {
  numbers: CellValues[];
  // Step (1, 2, …) at which each square was visited.
  order: Map<number, number>;
  current: number | null;
  lost: boolean;
  loading: boolean;
  disabled: boolean;
  onCell: (cell: CellValues) => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.board} data-loading={loading}>
      {numbers.slice(0, SIZE).map((cell) => {
        const { i, n, b } = cell.values;
        const { row, col } = ringPosition(i);
        const state: TileState = i === current ? "current" : b ? "visited" : lost ? "lost" : "free";
        return (
          <button
            key={i}
            type="button"
            className={styles.tile}
            data-state={state}
            data-order={order.get(i)}
            data-testid={`cell-${i}`}
            disabled={disabled || b}
            onClick={() => onCell(cell)}
            style={{ gridRow: row, gridColumn: col, "--i": i } as CSSProperties}
          >
            {n}
          </button>
        );
      })}
      <div className={styles.center}>{children}</div>
    </div>
  );
}

export function StepsRing({ steps, total = SIZE }: { steps: number; total?: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className={styles.ring}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle className={styles.track} cx="50" cy="50" r={radius} />
        <circle
          className={styles.bar}
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - steps / total)}
        />
      </svg>
      <span>
        <b className={`num ${styles.steps}`} data-testid="steps-value">
          {steps}
        </b>
        <span className={styles.stepsLabel}>of {total} steps</span>
      </span>
    </div>
  );
}
