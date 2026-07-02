import { Chess } from "chess.js";

// Cota de cordura: nada que ver con partidas reales, solo evita que un log
// absurdamente largo (bug de cliente o abuso) haga trabajar de más al
// servidor. 150 jugadas por bando es generoso para una partida humano-IA.
export const MAX_PLIES = 300;

export function uciMoveToParts(
  uci: unknown
): { from: string; to: string; promotion?: string } | null {
  if (typeof uci !== "string" || (uci.length !== 4 && uci.length !== 5)) return null;
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length === 5 ? uci.slice(4) : undefined,
  };
}

export function moveToUci(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export type ChessReplayResult =
  | { valid: true; chess: Chess; gameOver: boolean }
  | { valid: false; reason: string };

// Reproduce la partida entera desde el tablero inicial aplicando cada jugada
// registrada (propia o de la IA, ambas en UCI) con chess.js. Es la única
// fuente de verdad tanto para reconstruir la posición actual antes de
// aceptar la siguiente jugada (/api/chess) como para validar la partida
// completa al guardar el score — nunca se confía en un FEN o resultado
// mandado por el cliente.
export function replayChessMoves(moves: unknown): ChessReplayResult {
  if (!Array.isArray(moves) || moves.length > MAX_PLIES) {
    return { valid: false, reason: "Malformed or too-long move log." };
  }

  const chess = new Chess();
  for (const uci of moves) {
    const parts = uciMoveToParts(uci);
    if (!parts) return { valid: false, reason: `Malformed move: ${String(uci)}` };
    try {
      chess.move(parts);
    } catch {
      return { valid: false, reason: `Illegal move in recorded history: ${uci}` };
    }
  }

  return { valid: true, chess, gameOver: chess.isGameOver() };
}
