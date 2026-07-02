'use client';

import { Box, TextField, Button, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import MainMenu from "./components/MainMenu";
import Image from "next/image";
import { formatGameScore, useBestScores, type GameId } from "./hooks/useBestScores";
import { useUser } from "./hooks/useUser";

const key = "123213231asdssdadasdas213";

const GAMES: { gameId: GameId; href: string; icon: string; alt: string }[] = [
  { gameId: 1, href: "/bookmarks/pages/games/chess", icon: "/bookmarks/queen.png", alt: "Chess" },
  { gameId: 4, href: "/bookmarks/pages/games/words", icon: "/bookmarks/omega.png", alt: "Wording" },
  { gameId: 2, href: "/bookmarks/pages/games/numbers", icon: "/bookmarks/number.png", alt: "Numbers" },
  { gameId: 3, href: "/bookmarks/pages/games/tetris", icon: "/bookmarks/tetris.png", alt: "Tetris" },
];

const AgePage = () => {
  const [birthDate, setBirthDate] = useState("");
  const [days, setDays] = useState(0);

  const { user, loading: userLoading } = useUser();
  const { games: bestScores, loading: scoresLoading } = useBestScores();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBirthDate(localStorage.getItem(key) || "");
    }
  }, []);

  useEffect(() => {
    if (!birthDate) return;

    localStorage.setItem(key, birthDate);

    try {
      const a = new Date();

      const b = new Date(
        birthDate.substring(6, 10) + "-" +
        birthDate.substring(3, 5) + "-" +
        birthDate.substring(0, 2) +
        "T00:00:00"
      );

      if (!isNaN(b.getTime())) {
        setDays(Math.round((a.getTime() - b.getTime()) / 86400000));
      }
    } catch {}
  }, [birthDate]);

  const bestFor = (gameId: GameId) =>
    bestScores.find((g) => g.gameId === gameId) ?? null;

  const displayName = userLoading ? "..." : user.id;

  return (
    <>
      <MainMenu />

      <Box
        className="intro"
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
          gap: 4,
          m: 4,
        }}
      >
        <p>Enter your birthdate as <i>dd-mm-yyyy</i></p>

        <TextField
          style={{ background: "grey" }}
          value={birthDate}
          onChange={(e: any) => setBirthDate(e.target.value)}
        />

        <p>
          Dear <i>{displayName}</i>, you are since {days} days on planet Earth, congratulations!
        </p>

        <Box
          sx={{
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {GAMES.map(({ gameId, href, icon, alt }) => {
            const best = bestFor(gameId);
            return (
              <Box
                key={gameId}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.5,
                }}
              >
                <Button onClick={() => (window.location.href = href)}>
                  <Image alt={alt} width={64} height={64} src={icon} />
                </Button>

                <Typography
                  variant="caption"
                  sx={{ color: "white", opacity: 0.85, minHeight: "1.2em" }}
                >
                  {scoresLoading
                    ? "..."
                    : best?.found
                    ? `${formatGameScore(gameId, best.score!)} #${best.rank}`
                    : "Sin registro"}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </>
  );
};

export default AgePage;