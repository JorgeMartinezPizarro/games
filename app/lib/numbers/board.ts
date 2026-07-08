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

export type NumbersMove = { i: number; t: number };

export type MoveValidationResult =
  | { valid: true; steps: number }
  | { valid: false; reason: string };

// Cuánto se tolera que el timestamp de un clic (reloj del cliente) se
// adelante al tiempo real transcurrido desde la creación del nonce (reloj
// del servidor) — cubre latencia de red / pequeño desfase de reloj, no un
// intento de simular una partida más larga de la que realmente ocurrió.
const CLOCK_TOLERANCE_MS = 2000;

function parseMove(raw: unknown): NumbersMove | null {
  if (typeof raw !== "object" || raw === null) return null;
  const i = Number((raw as { i?: unknown }).i);
  const t = Number((raw as { t?: unknown }).t);
  if (!Number.isInteger(i) || !Number.isFinite(t)) return null;
  return { i, t };
}

// Reproduce la partida con los movimientos recibidos, aplicando las mismas
// reglas que app/hooks/useNumbers.ts (handleClick/isBlocked), para que un
// score no pueda enviarse sin haber jugado una partida legal. `elapsedMs` es
// el tiempo real transcurrido desde la creación del nonce (reloj del
// servidor, ver saveNumbersScore): ancla los timestamps de los clics (no
// pueden ser posteriores a ese tiempo real) al mismo reloj de confianza que
// usa el score final.
//
// No se rechaza por "clics demasiado rápidos": en la práctica, clics reales
// en un tablero pequeño (botones adyacentes, sin desplazamiento de ratón)
// caen habitualmente entre 50-80ms de diferencia — indistinguible de un
// script a esta resolución, así que un suelo de ritmo ahí solo generaba
// falsos positivos (partidas legítimas rechazadas en silencio). La defensa
// real contra resolver el tablero al instante está en la propia fórmula de
// score (computeNumbersScore ya tiene un suelo de ms/paso): ir más rápido
// del suelo no aumenta el score, así que no hay incentivo a hacer trampa.
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

// Cuadrática en steps (completar más tablero pesa, pero sin el disparo de
// la cúbica anterior) con un suelo en el ritmo medio (ms/paso): evita que un
// elapsedMs artificialmente bajo (p.ej. una partida resuelta al instante)
// dispare el score — a partir de ese suelo, ir "más rápido" ya no suma más.
const MIN_MS_PER_STEP = 150;
const SCORE_K = 1000;

export function computeNumbersScore(steps: number, elapsedMs: number): number {
  if (steps <= 0 || elapsedMs <= 0) return 0;
  const pace = Math.max(elapsedMs / steps, MIN_MS_PER_STEP);
  return Math.round((steps ** 2 * SCORE_K) / pace);
}
