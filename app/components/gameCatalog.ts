import { GAME_IDS, GAME_PATHS, type GameId } from "@/app/lib/scores/types";

export type GameKey = "chess" | "words" | "numbers" | "tetris";

export type GameInfo = {
  key: GameKey;
  id: GameId;
  name: string;
  description: string;
  // Game accent color (CSS token from globals.css).
  accent: string;
  // Path without basePath: next/link and the router add /bookmarks themselves.
  path: string;
};

// Order of the main menu.
export const GAMES: GameInfo[] = [
  {
    key: "chess",
    id: GAME_IDS.CHESS,
    name: "Chess",
    description: "Beat Stockfish. Your score is the ELO you checkmate.",
    accent: "var(--chess)",
    path: GAME_PATHS[GAME_IDS.CHESS],
  },
  {
    key: "words",
    id: GAME_IDS.WORDS,
    name: "Words",
    description: "Listen to the word and pick the right one. Ten rounds, no mistakes.",
    accent: "var(--words)",
    path: GAME_PATHS[GAME_IDS.WORDS],
  },
  {
    key: "numbers",
    id: GAME_IDS.NUMBERS,
    name: "Numbers",
    description: "Jump the exact distance around the ring without stepping on a square twice.",
    accent: "var(--numbers)",
    path: GAME_PATHS[GAME_IDS.NUMBERS],
  },
  {
    key: "tetris",
    id: GAME_IDS.TETRIS,
    name: "Tetris",
    description: "Clear 25 lines as fast as you can.",
    accent: "var(--tetris)",
    path: GAME_PATHS[GAME_IDS.TETRIS],
  },
];

export const GAME_BY_KEY = Object.fromEntries(GAMES.map((game) => [game.key, game])) as Record<
  GameKey,
  GameInfo
>;
