// Motor puro de Tetris, compartido entre cliente (app/hooks/useTetris.ts,
// para jugar en tiempo real) y servidor (app/lib/tetris/replay.ts, para
// reproducir y validar la partida). Debe comportarse EXACTAMENTE igual en
// ambos sitios: cualquier cambio aquí afecta a la vez al juego real y a la
// validación.

export type Cell = [string, string];
export type Board = Cell[][];
export type Piece = { shape: number[][]; color: string };

export const LINES_TARGET = 8;
export const DROP_SPEED_MS = 184;
export const ROWS = 20;
export const COLS = 10;

export const TETROMINOS: Piece[] = [
  { shape: [[1, 1, 1], [0, 1, 0]], color: "#e03030" }, // T - red
  { shape: [[1, 1], [1, 1]], color: "#e0c030" }, // O - yellow
  { shape: [[1, 1, 0], [0, 1, 1]], color: "#30c030" }, // S - green
  { shape: [[0, 1, 1], [1, 1, 0]], color: "#3070e0" }, // Z - blue
  { shape: [[1, 1, 1, 1]], color: "#30d0d0" }, // I - cyan
  { shape: [[1, 1, 1], [1, 0, 0]], color: "#e07030" }, // L - orange
  { shape: [[1, 1, 1], [0, 0, 1]], color: "#a030e0" }, // J - purple
];

export const createBoard = (rows: number = ROWS, cols: number = COLS): Board =>
  Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ["0", "clear"] as Cell)
  );

export const rotate = (matrix: number[][]): number[][] =>
  matrix[0].map((_, colIndex) => matrix.map((row) => row[colIndex]).reverse());

export const checkCollision = (
  board: Board,
  piece: Piece,
  x: number,
  y: number
): boolean => {
  return piece.shape.some((row, rowIndex) =>
    row.some((cell, colIndex) => {
      if (cell !== 0) {
        const newX = x + colIndex;
        const newY = y + rowIndex;
        if (
          newY >= board.length ||
          newX < 0 ||
          newX >= board[0].length ||
          (newY >= 0 && board[newY][newX][1] !== "clear")
        ) {
          return true;
        }
      }
      return false;
    })
  );
};

export function placePieceOnBoardPure(
  board: Board,
  piece: Piece,
  pos: { x: number; y: number }
): Board {
  const newBoard = board.map((row) => row.map((cell) => [...cell] as Cell));
  piece.shape.forEach((row, rowIndex) =>
    row.forEach((cell, colIndex) => {
      if (cell !== 0) {
        const ny = pos.y + rowIndex;
        const nx = pos.x + colIndex;
        if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
          newBoard[ny][nx] = [piece.color, "filled"];
        }
      }
    })
  );
  return newBoard;
}

export function clearLinesPure(board: Board): { newBoard: Board; cleared: number } {
  const kept = board.filter((row) => row.some((cell) => cell[1] === "clear"));
  const cleared = board.length - kept.length;
  if (cleared === 0) return { newBoard: board, cleared: 0 };
  const newRows = Array.from({ length: cleared }, () =>
    Array.from({ length: board[0].length }, () => ["0", "clear"] as Cell)
  );
  return { newBoard: [...newRows, ...kept], cleared };
}

export function hardDropDistance(
  board: Board,
  piece: Piece,
  pos: { x: number; y: number }
): number {
  let dist = 0;
  while (!checkCollision(board, piece, pos.x, pos.y + dist + 1)) dist++;
  return dist;
}
