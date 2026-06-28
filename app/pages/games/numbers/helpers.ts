import { CellValues } from "./types"

export const randomArrayCellValues = (length: number): CellValues[] => Array.from({ length }, (_, i: number) => {
    return {
      values: {
        n: Math.floor(Math.random() * 5) + 2,
        b: false,
        i,
      }
    }
})

// Verifica si existe al menos un camino que visite las 20 casillas
export function hasSolution(cells: CellValues[]): boolean {
  const n = cells.length;

  // DFS iterativo desde cada posible casilla de inicio
  for (let startIdx = 0; startIdx < n; startIdx++) {
    // Stack de estados: [posición actual, máscara de visitados]
    // Usamos un Set de strings "posición,visitados" para evitar revisitar estados
    const visited = new Set<string>();
    const stack: [number, number][] = [[startIdx, 1 << startIdx]];

    while (stack.length > 0) {
      const [pos, mask] = stack.pop()!;
      const stateKey = `${pos},${mask}`;

      if (visited.has(stateKey)) continue;
      visited.add(stateKey);

      // ¿Hemos visitado todas?
      if (mask === (1 << n) - 1) return true;

      const jump = cells[pos].values.n;

      // Dos vecinos posibles: adelante y atrás en el anillo
      const neighbors = [
        (pos + jump) % n,
        (pos - jump + n) % n,
      ];

      for (const next of neighbors) {
        if (!(mask & (1 << next))) {
          stack.push([next, mask | (1 << next)]);
        }
      }
    }
  }

  return false;
}