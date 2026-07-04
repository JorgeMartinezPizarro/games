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

// Verifica si existe al menos un camino que visite todas las casillas
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

export type MoveValidationResult =
  | { valid: true; steps: number }
  | { valid: false; reason: string };

// Reproduce la partida con los movimientos recibidos, aplicando las mismas
// reglas que app/pages/games/numbers/useNumbers.ts (handleClick/isBlocked),
// para que un score no pueda enviarse sin haber jugado una partida legal.
export function validateMoves(
  board: CellValues[],
  moves: unknown
): MoveValidationResult {
  const n = board.length;

  if (!Array.isArray(moves) || moves.length === 0) {
    return { valid: false, reason: "No moves provided." };
  }
  if (moves.length > n) {
    return { valid: false, reason: "Too many moves." };
  }

  const visited = new Array<boolean>(n).fill(false);
  let last: { i: number; n: number } | null = null;

  for (const rawIndex of moves) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= n) {
      return { valid: false, reason: "Invalid cell index." };
    }
    if (visited[index]) {
      return { valid: false, reason: "Cell already visited." };
    }

    if (last !== null) {
      const forward = (n + last.i - index) % n;
      const backward = (n - last.i + index) % n;
      if (forward !== last.n && backward !== last.n) {
        return { valid: false, reason: "Illegal move distance." };
      }
    }

    visited[index] = true;
    last = { i: index, n: board[index].values.n };
  }

  return { valid: true, steps: moves.length };
}

// Misma fórmula que useNumbers.ts, pero con steps/elapsed calculados
// por el servidor a partir de la partida validada.
export function computeNumbersScore(steps: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.round((steps ** 3 * 3500) / elapsedMs);
}
