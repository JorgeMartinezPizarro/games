import { GAME_IDS, GAME_PATHS, type GameId } from "@/app/lib/scores/types";

export type GameKey = "chess" | "words" | "numbers" | "tetris";

export type GameInfo = {
  key: GameKey;
  id: GameId;
  name: string;
  description: string;
  // Color de acento del juego (token CSS de globals.css).
  accent: string;
  // Ruta sin basePath: next/link y el router añaden /bookmarks solos.
  path: string;
};

// Orden del menú principal.
export const GAMES: GameInfo[] = [
  {
    key: "chess",
    id: GAME_IDS.CHESS,
    name: "Ajedrez",
    description: "Gana a Stockfish. Tu puntuación es el ELO al que le das mate.",
    accent: "var(--chess)",
    path: GAME_PATHS[GAME_IDS.CHESS],
  },
  {
    key: "words",
    id: GAME_IDS.WORDS,
    name: "Palabras",
    description: "Escucha la palabra y elige la correcta. Diez rondas, sin fallar.",
    accent: "var(--words)",
    path: GAME_PATHS[GAME_IDS.WORDS],
  },
  {
    key: "numbers",
    id: GAME_IDS.NUMBERS,
    name: "Números",
    description: "Salta la distancia exacta por el anillo sin repetir casilla.",
    accent: "var(--numbers)",
    path: GAME_PATHS[GAME_IDS.NUMBERS],
  },
  {
    key: "tetris",
    id: GAME_IDS.TETRIS,
    name: "Tetris",
    description: "Limpia 25 líneas lo más rápido posible.",
    accent: "var(--tetris)",
    path: GAME_PATHS[GAME_IDS.TETRIS],
  },
];

export const GAME_BY_KEY = Object.fromEntries(GAMES.map((game) => [game.key, game])) as Record<
  GameKey,
  GameInfo
>;
