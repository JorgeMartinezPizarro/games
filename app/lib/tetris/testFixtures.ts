import { COLS, Piece, ROWS, TETROMINOS } from "@/app/lib/tetris/engine";
import { createPieceGenerator } from "@/app/lib/tetris/rng";

const O_PIECE = TETROMINOS[1]; // 2x2 piece: the simplest one to position by hand
const I_PIECE = TETROMINOS[4]; // straight piece: the only one whose width changes when rotated

// Finds a seed whose first `count` generated pieces are all the O piece.
// With that we can fill (and clear) a full row by placing each piece in a
// different pair of columns, without having to actually solve Tetris for
// an arbitrary seed.
export function findSeedWithConsecutiveOPieces(count: number, maxSeed = 500_000): number {
  for (let seed = 0; seed < maxSeed; seed++) {
    const gen = createPieceGenerator(seed);
    let ok = true;
    for (let i = 0; i < count; i++) {
      if (gen() !== O_PIECE) {
        ok = false;
        break;
      }
    }
    if (ok) return seed;
  }
  throw new Error(`No seed found with ${count} consecutive O pieces (max ${maxSeed}).`);
}

// The 5 target columns (O piece = 2 columns wide, 10-wide board) that
// together fill the board's two bottom rows completely.
export const O_PIECE_TARGET_COLUMNS = [0, 2, 4, 6, 8];

export type LoggedAction = { type: string; t: number };

// Builds the action log (the format replayTetris consumes) that, with a
// seed from findSeedWithConsecutiveOPieces(5), fills and clears the two
// bottom rows of an empty board with 5 consecutive O pieces.
export function buildTwoRowClearActions(): LoggedAction[] {
  const spawnX = Math.floor(COLS / 2) - 1;
  const dropDistance = ROWS - 2; // O piece height = 2 rows, empty board

  const actions: LoggedAction[] = [];
  let t = 0;
  const push = (type: string) => actions.push({ type, t: t++ });

  push("resume");
  for (const col of O_PIECE_TARGET_COLUMNS) {
    const dx = col - spawnX;
    const horizontal = dx < 0 ? "left" : "right";
    for (let i = 0; i < Math.abs(dx); i++) push(horizontal);
    for (let i = 0; i <= dropDistance; i++) push("softDrop");
  }
  return actions;
}

// Generalizes findSeedWithConsecutiveOPieces to an arbitrary sequence of
// piece types (not just repeated O): finds a seed whose first
// `sequence.length` generated pieces match `sequence`, in order.
export function findSeedWithPieceSequence(sequence: Piece[], maxSeed = 2_000_000): number {
  for (let seed = 0; seed < maxSeed; seed++) {
    const gen = createPieceGenerator(seed);
    let ok = true;
    for (const target of sequence) {
      if (gen() !== target) {
        ok = false;
        break;
      }
    }
    if (ok) return seed;
  }
  throw new Error(
    `No seed found with that sequence of ${sequence.length} pieces (max ${maxSeed}).`
  );
}

// Piece sequence that buildWallKickExhaustionActions() needs: an I, four O
// and another I. Use with findSeedWithPieceSequence(WALL_KICK_SEQUENCE).
export const WALL_KICK_SEQUENCE: Piece[] = [I_PIECE, O_PIECE, O_PIECE, O_PIECE, O_PIECE, I_PIECE];

// Reproduces the wall-kick exhaustion in app/lib/tetris/replay.ts: the
// first I piece is rotated to vertical, moved until it touches the right
// wall (column 9), and a rotation back to horizontal is attempted right there.
// On an empty board, a horizontal I (4 wide) only fits up to
// x=6 — none of the 5 wall-kick offsets ([0,-1,1,-2,2]) lets it fit again
// at x=9, so the rotation must remain a no-op and the piece must stay
// vertical in column 9.
//
// The following pieces (4 O + 1 I) only fill the rest of the bottom row
// (columns 0-7 and 8) so that clearing exactly those 2 rows depends on
// column 9 having locked where it should: if the wall-kick had "slipped"
// outside the board's bounds instead of staying put, those 2 rows would
// never be completed.
export function buildWallKickExhaustionActions(): LoggedAction[] {
  const spawnX = Math.floor(COLS / 2) - 1;
  const iDropDistance = ROWS - 4; // height of the vertical I piece = 4 rows
  const oDropDistance = ROWS - 2;

  const actions: LoggedAction[] = [];
  let t = 0;
  const push = (type: string) => actions.push({ type, t: t++ });

  push("resume");

  // Piece 1 (I): to vertical, against the right wall (column 9), and a
  // rotation attempt that must exhaust the 5 wall-kicks with no effect.
  push("rotateRight");
  const toRightWall = COLS - 1 - spawnX; // column 4 -> 9
  for (let i = 0; i < toRightWall; i++) push("right");
  push("rotateRight"); // must be a no-op: stays vertical in column 9
  for (let i = 0; i <= iDropDistance; i++) push("softDrop");

  // 4 O pieces: fill columns 0-1, 2-3, 4-5 and 6-7.
  for (const col of O_PIECE_TARGET_COLUMNS.slice(0, 4)) {
    const dx = col - spawnX;
    const horizontal = dx < 0 ? "left" : "right";
    for (let i = 0; i < Math.abs(dx); i++) push(horizontal);
    for (let i = 0; i <= oDropDistance; i++) push("softDrop");
  }

  // Piece 6 (I): vertical, column 8 — the only one still missing to complete
  // both bottom rows.
  push("rotateRight");
  const toCol8 = 8 - spawnX;
  for (let i = 0; i < toCol8; i++) push("right");
  for (let i = 0; i <= iDropDistance; i++) push("softDrop");

  return actions;
}
