import type { GameKey } from "./gameCatalog";

// Iconos propios de cada juego (relleno con currentColor), pensados para ir
// sobre la baldosa de color del juego.
export default function GameIcon({ game, size = 24 }: { game: GameKey; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true } as const;

  switch (game) {
    case "chess":
      return (
        <svg {...common} fill="currentColor">
          <path d="M6.5 21h11v-2.2h-11zM8 17.6h8.4c-.3-2-1.2-3.4-1.2-5 0-1.2.9-2 .9-3.8 0-2.9-2.4-4.9-5.3-4.9H9.2l.8 1.8-3.4 3c-.6.6-.7 1.5-.2 2.1l.6.8c.5.6 1.3.7 1.9.3l1.8-1.2c.1 1.5-.6 2.6-1.5 3.6-.8.9-1.2 1.9-1.2 3.3z" />
        </svg>
      );
    case "words":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
        </svg>
      );
    case "numbers":
      // Anillo de casillas, como el tablero del juego.
      return (
        <svg {...common} fill="currentColor">
          {[
            [3, 3], [8, 3], [13, 3], [18, 3],
            [18, 8], [18, 13], [18, 18],
            [13, 18], [8, 18], [3, 18],
            [3, 13], [3, 8],
          ].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width={3.6} height={3.6} rx={1} opacity={i === 0 ? 1 : 0.55} />
          ))}
          <circle cx={12} cy={12} r={2.4} />
        </svg>
      );
    case "tetris":
      return (
        <svg {...common} fill="currentColor">
          <rect x="2.5" y="12" width="6" height="6" rx="1.3" />
          <rect x="9" y="12" width="6" height="6" rx="1.3" />
          <rect x="15.5" y="12" width="6" height="6" rx="1.3" />
          <rect x="9" y="5.5" width="6" height="6" rx="1.3" />
        </svg>
      );
  }
}
