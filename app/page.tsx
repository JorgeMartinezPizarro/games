'use client';

import { Box, TextField, Card, CardActionArea, CardContent, Typography } from "@mui/material";
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
          gap: { xs: 2, sm: 4 },
          mx: { xs: 2, sm: 4 },
          my: { xs: 3, sm: 4 },
        }}
      >
        <p>Enter your birthdate [dd-mm-yyyy]</p>

        <TextField
          style={{ background: "grey" }}
          value={birthDate}
          onChange={(e: any) => setBirthDate(e.target.value)}
        />

        <p style={{textAlign: "center"}}>
			Dear {displayName}, you've been riding Earth's spin for {days} rotations.
			<br/>
			No tracking. No ads. Just games.
        </p>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
            gap: { xs: 1.5, sm: 2.5 },
            width: "100%",
            maxWidth: 720,
          }}
        >
          {GAMES.map(({ gameId, href, icon, alt }) => {
            const best = bestFor(gameId);
            return (
              <Card
                key={gameId}
                sx={{
                  width: "100%",
                  bgcolor: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 4,
                  transition: "transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: "0 10px 26px rgba(0,0,0,0.4)",
                    bgcolor: "rgba(255,255,255,0.14)",
                  },
                }}
              >
                <CardActionArea onClick={() => (window.location.href = href)}>
                  <CardContent
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 1,
                      py: 3,
                    }}
                  >
                    <Image alt={alt} width={56} height={56} src={icon} />

                    <Typography variant="subtitle1" sx={{ color: "white", fontWeight: 700 }}>
                      {alt}
                    </Typography>

                    <Box
                      sx={{
                        mt: 0.5,
                        px: 1.5,
                        py: 0.5,
                        borderRadius: 5,
                        bgcolor: "rgba(0,0,0,0.28)",
                        minHeight: "1.6em",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Typography variant="caption" sx={{ color: "white", opacity: 0.9 }}>
                        {scoresLoading
                          ? "..."
                          : best?.found
                          ? `${formatGameScore(gameId, best.score!)} · #${best.rank}`
                          : "Sin registro"}
                      </Typography>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>
      </Box>
    </>
  );
};

export default AgePage;