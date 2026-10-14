import type { CellValues } from "@/app/types";

export const BOARD_SIZE = 20;

function randomArrayCellValues(length: number): CellValues[] {
  return Array.from({ length }, (_, i: number) => ({
    values: {
      n: Math.floor(Math.random() * 5) + 2,
      b: false,
      i,
    },
  }));
}

// Checks whether at least one path exists that visits every cell
export function hasSolution(cells: CellValues[]): boolean {
  const n = cells.length;

  for (let startIdx = 0; startIdx < n; startIdx++) {
    const visited = new Set<string>();
    const stack: [number, number][] = [[startIdx, 1 << startIdx]];

    while (stack.length > 0) {
      const [pos, mask] = stack.pop()!;
      const stateKey = `${pos},${mask}`;

      if (visited.has(stateKey)) continue;
      visited.add(stateKey);

      if (mask === (1 << n) - 1) return true;

      const jump = cells[pos].values.n;
      const neighbors = [(pos + jump) % n, (pos - jump + n) % n];

      for (const next of neighbors) {
        if (!(mask & (1 << next))) {
          stack.push([next, mask | (1 << next)]);
        }
      }
    }
  }

  return false;
}

export function generateBoard(length: number = BOARD_SIZE): CellValues[] {
  let cells = randomArrayCellValues(length);
  let attempts = 0;
  while (!hasSolution(cells) && attempts < 200) {
    cells = randomArrayCellValues(length);
    attempts++;
  }
  return cells;
}

export function boardsMatch(a: CellValues[], b: unknown): boolean {
  if (!Array.isArray(b) || a.length !== b.length) return false;

  return a.every((cell, index) => {
    const other = b[index] as { values?: { n?: unknown } } | undefined;
    return other?.values?.n === cell.values.n;
  });
}

export type NumbersMove = { i: number; t: number };

export type MoveValidationResult =
  | { valid: true; steps: number }
  | { valid: false; reason: string };

// How far a click's timestamp (client clock) is allowed to run ahead of the
// real time elapsed since the nonce was created (server clock) — covers
// network latency / small clock skew, not an attempt to fake a longer game
// than the one that actually happened.
const CLOCK_TOLERANCE_MS = 2000;

function parseMove(raw: unknown): NumbersMove | null {
  if (typeof raw !== "object" || raw === null) return null;
  const i = Number((raw as { i?: unknown }).i);
  const t = Number((raw as { t?: unknown }).t);
  if (!Number.isInteger(i) || !Number.isFinite(t)) return null;
  return { i, t };
}

// Replays the game with the received moves, applying the same rules as
// app/hooks/useNumbers.ts (handleClick/isBlocked), so a score can't be
// submitted without having played a legal game. `elapsedMs` is the real
// time elapsed since the nonce was created (server clock, see
// saveNumbersScore): it anchors the click timestamps (they can't be later
// than that real time) to the same trusted clock the final score uses.
//
// There is no rejection for "clicks too fast": in practice, real clicks on
// a small board (adjacent buttons, no mouse travel) commonly land 50-80ms
// apart — indistinguishable from a script at this resolution, so a pace
// floor there only produced false positives (legitimate games silently
// rejected). The real defense against solving the board instantly lives in
// the score formula itself (computeNumbersScore already has a ms/step
// floor): going faster than the floor doesn't raise the score, so there is
// no incentive to cheat.
export function validateMoves(
  board: CellValues[],
  rawMoves: unknown,
  elapsedMs: number
): MoveValidationResult {
  const n = board.length;

  if (!Array.isArray(rawMoves) || rawMoves.length === 0) {
    return { valid: false, reason: "No moves provided." };
  }
  if (rawMoves.length > n) {
    return { valid: false, reason: "Too many moves." };
  }

  const visited = new Array<boolean>(n).fill(false);
  let last: { i: number; n: number; t: number } | null = null;

  for (const rawMove of rawMoves) {
    const move = parseMove(rawMove);
    if (!move) {
      return { valid: false, reason: "Malformed move." };
    }
    const { i: index, t } = move;

    if (!Number.isInteger(index) || index < 0 || index >= n) {
      return { valid: false, reason: "Invalid cell index." };
    }
    if (visited[index]) {
      return { valid: false, reason: "Cell already visited." };
    }
    if (t < 0 || t > elapsedMs + CLOCK_TOLERANCE_MS) {
      return { valid: false, reason: "Move timestamp out of range." };
    }

    if (last !== null) {
      const forward = (n + last.i - index) % n;
      const backward = (n - last.i + index) % n;
      if (forward !== last.n && backward !== last.n) {
        return { valid: false, reason: "Illegal move distance." };
      }
      if (t < last.t) {
        return { valid: false, reason: "Move timestamps out of order." };
      }
    }

    visited[index] = true;
    last = { i: index, n: board[index].values.n, t };
  }

  return { valid: true, steps: rawMoves.length };
}

// Quadratic in steps (completing more of the board counts, but without the
// blow-up of the previous cubic) with a floor on the average pace (ms/step):
// keeps an artificially low elapsedMs (e.g. a game solved instantly) from
// blowing up the score — past that floor, going "faster" adds nothing.
const MIN_MS_PER_STEP = 150;
const SCORE_K = 1000;

export function computeNumbersScore(steps: number, elapsedMs: number): number {
  if (steps <= 0 || elapsedMs <= 0) return 0;
  const pace = Math.max(elapsedMs / steps, MIN_MS_PER_STEP);
  return Math.round((steps ** 2 * SCORE_K) / pace);
}
