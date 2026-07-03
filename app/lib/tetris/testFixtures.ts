import { COLS, ROWS, TETROMINOS } from "@/app/lib/tetris/engine";
import { createPieceGenerator } from "@/app/lib/tetris/rng";

const O_PIECE = TETROMINOS[1]; // pieza 2x2: la más simple de posicionar a mano

// Busca un seed cuyas primeras `count` piezas generadas sean todas la pieza
// O. Con eso podemos rellenar (y limpiar) una fila completa colocando cada
// pieza en un par de columnas distinto, sin tener que resolver Tetris de
// verdad para un seed arbitrario.
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
  throw new Error(`No se encontró un seed con ${count} piezas O consecutivas (max ${maxSeed}).`);
}

// Las 5 columnas destino (pieza O = 2 columnas de ancho, tablero de 10) que
// entre las 5 rellenan las dos filas inferiores del tablero por completo.
export const O_PIECE_TARGET_COLUMNS = [0, 2, 4, 6, 8];

export type LoggedAction = { type: string; t: number };

// Construye el log de acciones (formato que consume replayTetris) que, con
// un seed de findSeedWithConsecutiveOPieces(5), rellena y limpia las dos
// filas inferiores de un tablero vacío con 5 piezas O consecutivas.
export function buildTwoRowClearActions(): LoggedAction[] {
  const spawnX = Math.floor(COLS / 2) - 1;
  const dropDistance = ROWS - 2; // altura de una pieza O = 2 filas, tablero vacío

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
