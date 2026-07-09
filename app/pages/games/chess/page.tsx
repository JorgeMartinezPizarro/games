"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import {
  Button,
  Typography,
  Box,
  Slider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import { Chessboard } from "react-chessboard";
import MainMenu from "@/app/components/MainMenu";
import { useChessGame } from "@/app/hooks/useChessGame";
import { useChessScore } from "@/app/hooks/useChessScore";

const ChessGame: React.FC = () => {
  const [showScores, setShowScores] = useState(false);
  const [boardWidth, setBoardWidth] = useState(600);

  const score = useChessScore();
  const chess = useChessGame({
    onPlayerWin: score.saveScore,
    onReset: score.resetSaveGuard,
  });

  const {
    fen,
    elo,
    gameResult,
    gameStarted,
    isAIThinking,
    isGameOver,
    gameError,
    optionSquares,
    handleEloChange,
    resetGame,
    onSquareClick,
    onDrop,
  } = chess;

  const displayError = gameError || score.scoreError;

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Refs para medir el espacio real ocupado por debajo del tablero
  // (slider + bloque de resultado) y poder calcular cuánto puede crecer
  // el tablero sin provocar scroll vertical.
  const boardBoxRef = useRef<HTMLDivElement | null>(null);
  const belowBoardRef = useRef<HTMLDivElement | null>(null);

  // Ajuste del ancho/alto del tablero al cliente y al redimensionar.
  // El tablero es cuadrado, así que su tamaño debe respetar TANTO el
  // ancho disponible COMO la altura disponible (ancho de ventana - chrome
  // de cabecera, y altura de ventana - todo lo que va debajo del tablero).
  useLayoutEffect(() => {
    if (showScores) return; // no hay tablero que medir en la vista de scores

    let rafId: number | null = null;

    const updateBoardWidth = () => {
      const sidePadding = isMobile ? 4 : 16; // debe coincidir con el px del Box contenedor
      const widthBased = Math.min(600, window.innerWidth - sidePadding * 2);

      let heightBased = widthBased;

      if (boardBoxRef.current && belowBoardRef.current) {
        const boardRect = boardBoxRef.current.getBoundingClientRect();
        const lastRect = belowBoardRef.current.getBoundingClientRect();

        const nonBoardHeight = lastRect.bottom - boardRect.bottom;
        const buffer = 12;

        heightBased = window.innerHeight - boardRect.top - nonBoardHeight - buffer;
      }

      setBoardWidth(Math.max(200, Math.min(widthBased, heightBased)));
    };

    // Recalcula en el siguiente frame (y uno más después) para asegurarnos
    // de medir tras el layout/paint definitivo, no el provisional del montaje.
    const scheduleUpdate = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updateBoardWidth();
        rafId = requestAnimationFrame(updateBoardWidth);
      });
    };

    scheduleUpdate();

    // Si las fuentes tardan en cargar, su llegada puede cambiar las alturas
    // medidas (Slider, Typography, etc.) -> recalculamos cuando estén listas.
    if (typeof document !== "undefined" && (document as any).fonts?.ready) {
      (document as any).fonts.ready.then(scheduleUpdate).catch(() => {});
    }

    // ResizeObserver capta cualquier cambio real de tamaño de los contenedores
    // medidos (no solo resize de ventana), que es justo lo que el zoom in/out
    // estaba "arreglando" por accidente.
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => scheduleUpdate());
      if (boardBoxRef.current) resizeObserver.observe(boardBoxRef.current);
      if (belowBoardRef.current) resizeObserver.observe(belowBoardRef.current);
    }

    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleUpdate);
      resizeObserver?.disconnect();
    };
  }, [isMobile, showScores]);

  const boardContainerStyle: React.CSSProperties = {
    width: boardWidth,
    maxWidth: "100%",
    touchAction: "none",
    marginInline: "auto",
  };

  return (
    <>
      <MainMenu />
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          gap: 2,
          mt: 1,
          mx: 2,
        }}
      >
        <Button
          variant="contained"
          onClick={() => setShowScores(!showScores)}
          sx={{
            borderRadius: 50,
            px: 4,
            py: 1,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            fontWeight: "bold",
            textTransform: "none",
            fontSize: "1rem",
            transition: "all 0.2s",
            "&:hover": {
              transform: "translateY(-2px)",
              boxShadow: "0 6px 16px rgba(0,0,0,0.2)",
            },
          }}
        >
          {showScores ? "🎯 Game" : "🏆 Scores"}
        </Button>

        {!showScores && (
          <Button
            onClick={() => resetGame()}
            variant="contained"
            color="secondary"
            sx={{
              borderRadius: 50,
              px: 4,
              py: 1,
              fontWeight: "bold",
              textTransform: "none",
              fontSize: "1rem",
              color: "grey",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              transition: "all 0.2s",
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: "0 6px 16px rgba(0,0,0,0.2)",
              },
            }}
          >
            🔄 Restart
          </Button>
        )}
      </Box>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(100vh - 140px)",
          textAlign: "center",
          px: isMobile ? "4px" : 2,
          py: 1,
          boxSizing: "border-box",
        }}
      >
        {!showScores ? (
          <>
            <Box ref={boardBoxRef} style={boardContainerStyle}>
              <Chessboard
                id="chessboard"
                position={fen}
                onPieceDrop={onDrop}
                onSquareClick={onSquareClick}
                customSquareStyles={optionSquares}
                boardWidth={boardWidth}
                arePiecesDraggable={!isGameOver && !isAIThinking}
                customBoardStyle={{
                  borderRadius: "8px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
                }}
              />
            </Box>

            <Box sx={{ width: "100%", maxWidth: 400, mt: 2, px: 2 }}>
              <Slider
                value={elo}
                onChange={handleEloChange}
                min={400}
                max={3000}
                step={1}
                valueLabelDisplay="auto"
                disabled={gameStarted}
                marks={[
                  { value: 400, label: "400" },
                  { value: 3000, label: "3000" },
                ]}
                sx={{
                  color: theme.palette.primary.main,
                  "& .MuiSlider-markLabel": {
                    fontSize: "0.8rem",
                    '&[data-index="0"]': {
                      transform: "translateX(0%)",
                    },
                    '&[data-index="1"]': {
                      transform: "translateX(-100%)",
                    },
                  },
                }}
              />
              <Typography variant="body1" align="center" sx={{ mt: 1 }}>
                AI Strength: <strong>{elo}</strong>
                {gameStarted && " (locked)"}
              </Typography>
            </Box>

            {/* Contenedor de altura fija: reserva el hueco siempre, evita saltos de layout */}
            <Box
              ref={belowBoardRef}
              sx={{
                mt: 1.5,
                minHeight: 88,
                width: "100%",
                maxWidth: 400,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 1,
              }}
            >
              <Paper
                elevation={3}
                sx={{
                  px: 4,
                  py: 1.5,
                  borderRadius: 8,
                  backgroundColor: theme.palette.secondary.light,
                  color: theme.palette.secondary.contrastText,
                  visibility: gameResult ? "visible" : "hidden",
                }}
              >
                <Typography variant="h5" sx={{ fontWeight: "bold" }} gutterBottom>
                  {gameResult || "placeholder"}
                </Typography>
              </Paper>

              <Typography
                variant="body2"
                sx={{
                  fontWeight: "bold",
                  color: score.myRank && score.myRank.rank <= 10 ? "secondary.main" : "text.secondary",
                  visibility: score.myRank ? "visible" : "hidden",
                }}
              >
                {score.myRank ? `Tu posición: #${score.myRank.rank} de ${score.myRank.total}` : "placeholder"}
              </Typography>

              <Typography
                variant="body2"
                color="textSecondary"
                sx={{ visibility: isAIThinking ? "visible" : "hidden" }}
              >
                🤔 AI is thinking...
              </Typography>

              <Typography
                variant="body2"
                color="error"
                sx={{ visibility: displayError ? "visible" : "hidden" }}
              >
                {displayError || "placeholder"}
              </Typography>
            </Box>
          </>
        ) : (
          <Box sx={{ width: "100%", maxWidth: 600, px: 2 }}>
            {score.topScores.length > 0 ? (
              <>
                <Typography variant="h5" sx={{ fontWeight: "bold" }} gutterBottom>
                  🏆 Top Scores
                </Typography>
                <TableContainer component={Paper} elevation={3} sx={{ borderRadius: 3 }}>
                  <Table>
                    <TableHead>
                      <TableRow sx={{ backgroundColor: theme.palette.primary.main }}>
                        <TableCell sx={{ color: "white", fontWeight: "bold" }}>#</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: "bold" }}>User</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: "bold" }}>Score</TableCell>
                        <TableCell sx={{ color: "white", fontWeight: "bold" }}>Date</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {score.topScores
                        .slice()
                        .sort((a, b) => b.elo - a.elo)
                        .slice(0, 10)
                        .map((entry, index) => (
                          <TableRow key={index} hover>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>{entry.userId}</TableCell>
                            <TableCell>{entry.elo}</TableCell>
                            <TableCell>
                              {new Date(entry.time).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {score.scoreError && (
                  <Typography variant="body2" color="error" sx={{ mt: 2 }}>
                    {score.scoreError}
                  </Typography>
                )}
              </>
            ) : (
              <Typography variant="body1" color="textSecondary">
                {score.scoreError || "No scores yet. Play a game!"}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </>
  );
};

export default ChessGame;
