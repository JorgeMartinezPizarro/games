import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import ArrowBackIosNewRounded from "@mui/icons-material/ArrowBackIosNewRounded";
import GameIcon from "./GameIcon";
import { GAME_BY_KEY, type GameKey } from "./gameCatalog";
import styles from "./GameShell.module.css";

// Common layout of every game: top bar (back, name, actions) and the play
// area. Sets the game's accent color for everything inside it.
export default function GameShell({
  game,
  actions,
  children,
}: {
  game: GameKey;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const info = GAME_BY_KEY[game];

  return (
    <div className={`${styles.shell} accent-scope`} style={{ "--accent": info.accent } as CSSProperties}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.back} aria-label="Back to games">
          <ArrowBackIosNewRounded sx={{ fontSize: 14 }} />
          <span className={styles.backLabel}>Games</span>
        </Link>
        <span className={styles.tile}>
          <GameIcon game={game} size={22} />
        </span>
        <h1 className={styles.title}>{info.name}</h1>
        <span className={styles.spacer} />
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
