// A real game (actually playable with chess.js, no Stockfish or docker):
// the knights go out and back to their starting squares three times,
// repeating the initial position a third time → draw by threefold repetition.
// replayChessMoves only needs a log of legal UCI moves, it doesn't care who
// played them — so the "draws don't score" branch of saveChessScore can be
// tested without depending on the Stockfish service.
export const THREEFOLD_REPETITION_DRAW = [
  "g1f3", "g8f6",
  "f3g1", "f6g8",
  "g1f3", "g8f6",
  "f3g1", "f6g8",
];
