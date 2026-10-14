import Link from "next/link";
import type { CSSProperties } from "react";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import GameIcon from "./GameIcon";
import type { GameInfo } from "./gameCatalog";
import styles from "./Home.module.css";

// Shown instead of a best score when the player has none yet.
export const NO_SCORE = "No score yet";

// A game's card on the main menu, with the player's best score.
export default function GameCard({ game, best }: { game: GameInfo; best: string | null }) {
  return (
    <Link
      href={game.path}
      className={`${styles.card} accent-scope`}
      style={{ "--accent": game.accent } as CSSProperties}
      aria-label={`Play ${game.name}`}
      data-testid={`game-${game.key}`}
    >
      <span className={styles.tile}>
        <GameIcon game={game.key} size={30} />
      </span>
      <span className={styles.cardText}>
        <h2 className={styles.cardTitle}>{game.name}</h2>
        <p className={styles.cardDescription}>{game.description}</p>
      </span>
      <span className={styles.cardFoot}>
        <span className={styles.best}>
          <small>Your best</small>
          <b className="num" data-testid={`best-${game.key}`} data-empty={best === NO_SCORE}>
            {best ?? "…"}
          </b>
        </span>
        <span className={styles.go} aria-hidden>
          <ChevronRightRounded />
        </span>
      </span>
    </Link>
  );
}
