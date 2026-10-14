'use client';

import EarthChip from "./components/EarthChip";
import GameCard, { NO_SCORE } from "./components/GameCard";
import { GAMES } from "./components/gameCatalog";
import styles from "./components/Home.module.css";
import { formatGameScore, useBestScores } from "./hooks/useBestScores";
import { useEarthRotations } from "./hooks/useEarthRotations";
import { useUser } from "./hooks/useUser";

const HomePage = () => {
  const { user, loading: userLoading } = useUser();
  const { games: bestScores, loading: scoresLoading } = useBestScores();
  const earth = useEarthRotations();

  const name = userLoading || user.id === "anonymous" ? "" : user.name;

  const bestLabel = (gameId: number): string | null => {
    if (scoresLoading) return null;
    const best = bestScores.find((g) => g.gameId === gameId);
    return best?.found
      ? `${formatGameScore(best.gameId, best.score!)} · #${best.rank}`
      : NO_SCORE;
  };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.hello}>{name ? `Hi, ${name}` : "Hi"}</h1>
        <div className={styles.sub}>
          <span>No tracking. No ads. Just games.</span>
          <EarthChip birthDate={earth.birthDate} rotations={earth.rotations} onChange={earth.setBirthDate} />
        </div>

        <nav className={styles.grid} aria-label="Games">
          {GAMES.map((game) => (
            <GameCard key={game.key} game={game} best={bestLabel(game.id)} />
          ))}
        </nav>
      </div>
    </div>
  );
};

export default HomePage;
