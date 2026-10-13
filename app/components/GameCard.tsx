import Link from "next/link";
import type { CSSProperties } from "react";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import GameIcon from "./GameIcon";
import type { GameInfo } from "./gameCatalog";
import styles from "./Home.module.css";

// Tarjeta de un juego en el menú principal, con tu mejor marca.
export default function GameCard({ game, best }: { game: GameInfo; best: string | null }) {
  return (
    <Link
      href={game.path}
      className={`${styles.card} accent-scope`}
      style={{ "--accent": game.accent } as CSSProperties}
      aria-label={`Jugar a ${game.name}`}
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
          <small>Tu mejor</small>
          <b className="num" data-testid={`best-${game.key}`} data-empty={best === "Sin registro"}>
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
