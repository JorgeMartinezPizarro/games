import { Chess } from "chess.js";

// Sanity bound: nothing to do with real games, it just keeps an absurdly
// long log (client bug or abuse) from making the server do extra work.
// 150 moves per side is generous for a human-vs-AI game.
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

// Replays the whole game from the initial board, applying each recorded
// move (the player's or the AI's, both in UCI) with chess.js. It is the only
// source of truth both for rebuilding the current position before accepting
// the next move (/api/chess) and for validating the complete game when
// saving the score — a FEN or result sent by the client is never trusted.
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
