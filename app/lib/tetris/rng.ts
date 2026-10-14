import { Piece, TETROMINOS } from "@/app/lib/tetris/engine";

// mulberry32: cheap deterministic PRNG, good enough for Tetris pieces
// (it isn't cryptographic, and doesn't need to be — the seed isn't a
// secret, it's public like the numbers board: the security comes from
// validating the game against the SAME piece sequence, not from hiding it).
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generates a 32-bit seed without depending on Math.random on the server.
export function randomSeed(): number {
  return (Date.now() ^ (Math.floor(Math.random() * 0xffffffff))) >>> 0;
}

// Deterministic piece generator: same calls in the same order ⇒ same piece
// sequence, both on the client (real game) and on the server (validation
// replay).
export function createPieceGenerator(seed: number): () => Piece {
  const rng = mulberry32(seed);
  return () => TETROMINOS[Math.floor(rng() * TETROMINOS.length)];
}
