import { Piece, TETROMINOS } from "@/app/lib/tetris/engine";

// mulberry32: PRNG determinista y barato, suficiente para piezas de Tetris
// (no es criptográfico, no hace falta — el seed no es un secreto, es
// público como el tablero de numbers: la seguridad viene de validar la
// partida contra la MISMA secuencia de piezas, no de ocultarla).
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

// Genera un seed de 32 bits sin depender de Math.random en el servidor.
export function randomSeed(): number {
  return (Date.now() ^ (Math.floor(Math.random() * 0xffffffff))) >>> 0;
}

// Generador de piezas determinista: mismas llamadas en el mismo orden ⇒
// misma secuencia de piezas, tanto en el cliente (juego real) como en el
// servidor (replay de validación).
export function createPieceGenerator(seed: number): () => Piece {
  const rng = mulberry32(seed);
  return () => TETROMINOS[Math.floor(rng() * TETROMINOS.length)];
}
