"use client";

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
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
import { Chess, Square } from "chess.js";
import MainMenu from "@/app/components/MainMenu";

const ChessGame: React.FC = () => {
  const gameRef = useRef<Chess | null>(null);
  const [fen, setFen] = useState("start");
  const [elo, setElo] = useState(800);
  const [gameResult, setGameResult] = useState<string | null>(null);
  const [topScores, setTopScores] = useState<any[]>([]);
  const [showScores, setShowScores] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [boardWidth, setBoardWidth] = useState(600);
  const [scoreError, setScoreError] = useState<string | null>(null);

  // --- Sistema de dos clics ---
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, any>>({});

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

  const handleEloChange = (_event: Event, newValue: number | number[]) => {
    if (!gameStarted) {
      setElo(newValue as number);
    }
  };

  // Cálculo de puntuación basado en el resultado
  
  // Cargar las mejores puntuaciones
  const loadScores = useCallback(async () => {
    setScoreError(null);
    try {
      const response = await fetch("/bookmarks/api/scores?gameId=1");
      const data = await response.json();
      if (data.scores) {
        setTopScores(
          data.scores.map((score: any) => ({
            elo: score.score, // La API devuelve `score`
            time: score.createdAt, // La API devuelve `createdAt`
            name: score.username,
          }))
        );
      }
    } catch (error) {
      console.error("Error loading scores:", error);
      setScoreError("No se pudieron cargar las puntuaciones.");
    }
  }, []);

  // Guardar puntuación
  const saveScore = useCallback(async () => {
    if (scoreSaved) return;
    setScoreError(null);
    try {
      const response = await fetch("/bookmarks/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: 1,
          score: elo,
          gameConfig: { elo },
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Error al guardar la puntuación");
      }
      setScoreSaved(true);
      await loadScores(); // Actualiza la tabla de puntuaciones
    } catch (error) {
      console.error("Error saving score:", error);
      setScoreError("No se pudo guardar la puntuación. Inténtalo de nuevo.");
    }
  }, [scoreSaved, elo, loadScores]);

  // Manejar fin de partida (guarda automáticamente)
  const handleGameOver = useCallback((game: Chess) => {
    let result = "";
    if (game.isCheckmate()) {
      result = game.turn() === "w" ? "IA gana (mate)" : "Jugador gana (mate)";
    } else if (game.isDraw()) {
      result = "Empate (tablas)";
    } else if (game.isStalemate()) {
      result = "Empate (ahogado)";
    } else if (game.isThreefoldRepetition()) {
      result = "Empate (repetición)";
    } else if (game.isInsufficientMaterial()) {
      result = "Empate (material insuficiente)";
    }
    if (result) {
      setGameResult(result);
      setIsGameOver(true);
    }
  }, []);

  // Efecto para guardar puntuación cuando termine la partida
  useEffect(() => {
    if (gameResult && !scoreSaved && isGameOver) {
      saveScore();
    }
  }, [gameResult, scoreSaved, isGameOver, saveScore]);

  // Movimiento de la IA
  const makeAIMove = useCallback(async () => {
    const game = gameRef.current;
    if (!game || isGameOver || isAIThinking) return;

    setIsAIThinking(true);
    const currentFen = game.fen();

    try {
      const response = await fetch("/bookmarks/api/chess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: currentFen, elo }),
      });

      const data = await response.json();

      if (data.bestmove) {
        const from = data.bestmove.slice(0, 2);
        const to = data.bestmove.slice(2, 4);

        try {
          const move = game.move({
            from,
            to,
            promotion: "q",
          });

          if (move) {
            const newFen = game.fen();
            setFen(newFen);

            if (game.isGameOver()) {
              handleGameOver(game);
            }
          }
        } catch (moveError) {
          // La IA no debería proponer jugadas ilegales, pero por si acaso lo capturamos
          console.error("Movimiento de IA inválido, ignorado:", moveError);
        }
      }
    } catch (error) {
      console.error("Error making AI move:", error);
    } finally {
      setIsAIThinking(false);
    }
  }, [elo, isAIThinking, isGameOver, handleGameOver]);

  // Limpia selección y resaltado de casillas (común a drag y a clic)
  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setOptionSquares({});
  }, []);

  // Intenta realizar un movimiento; ignora silenciosamente si es inválido (misclick)
  const tryMove = useCallback(
    (from: string, to: string): boolean => {
      const game = gameRef.current;
      if (!game) return false;

      try {
        const move = game.move({
          from,
          to,
          promotion: "q",
        });

        if (!move) {
          // chess.js devolvió null/false: movimiento ilegal, lo ignoramos como misclick
          return false;
        }

        const newFen = game.fen();
        setFen(newFen);
        if (!gameStarted) setGameStarted(true);

        if (game.isGameOver()) {
          handleGameOver(game);
        } else {
          setTimeout(() => makeAIMove(), 300);
        }
        return true;
      } catch (e) {
        // chess.js (v1+) lanza excepción en movimientos ilegales: la capturamos
        // y la tratamos igual que un misclick, sin romper la UI.
        console.warn("Movimiento inválido ignorado:", e);
        return false;
      }
    },
    [gameStarted, handleGameOver, makeAIMove]
  );

  // Muestra las casillas de destino legales para la pieza seleccionada
  const showOptionsForSquare = useCallback((square: Square) => {
    const game = gameRef.current;
    if (!game) return;

    try {
      const moves = game.moves({ square, verbose: true }) as any[];
      if (!moves.length) {
        setOptionSquares({});
        return;
      }

      const newSquares: Record<string, any> = {
        [square]: {
          background: "rgba(255, 255, 0, 0.4)",
        },
      };

      moves.forEach((m) => {
        newSquares[m.to] = {
          background:
            "radial-gradient(circle, rgba(0,0,0,0.25) 25%, transparent 26%)",
          borderRadius: "50%",
        };
      });

      setOptionSquares(newSquares);
    } catch (e) {
      // Si algo falla al calcular las jugadas legales, simplemente no resaltamos nada
      console.warn("No se pudieron calcular movimientos legales:", e);
      setOptionSquares({});
    }
  }, []);

  // --- Clic en una casilla (sistema de dos clics) ---
  const onSquareClick = useCallback(
    (square: Square) => {
      const game = gameRef.current;
      if (!game || isGameOver || isAIThinking) return;

      // Caso 1: no había nada seleccionado todavía
      if (!selectedSquare) {
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
          setSelectedSquare(square);
          showOptionsForSquare(square);
        }
        return;
      }

      // Caso 2: se hace clic en la misma casilla ya seleccionada -> deseleccionar
      if (selectedSquare === square) {
        clearSelection();
        return;
      }

      // Caso 3: ya había una pieza seleccionada, intentamos mover
      const moved = tryMove(selectedSquare, square);

      if (moved) {
        clearSelection();
        return;
      }

      // El movimiento no era válido (misclick). Si el clic fue sobre otra
      // pieza propia, la seleccionamos en su lugar; si no, deseleccionamos.
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
        showOptionsForSquare(square);
      } else {
        clearSelection();
      }
    },
    [selectedSquare, isGameOver, isAIThinking, tryMove, showOptionsForSquare, clearSelection]
  );

  // --- Drag & drop (sigue disponible junto al sistema de clics) ---
  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean => {
      if (isGameOver || isAIThinking) return false;

      const moved = tryMove(sourceSquare, targetSquare);
      if (moved) {
        clearSelection();
      }
      return moved;
    },
    [isGameOver, isAIThinking, tryMove, clearSelection]
  );

  // Reiniciar partida
  const resetGame = useCallback(() => {
    const newGame = new Chess();
    gameRef.current = newGame;
    setFen("start");
    setGameResult(null);
    setGameStarted(false);
    setScoreSaved(false);
    setIsAIThinking(false);
    setIsGameOver(false);
    setScoreError(null);
    clearSelection();
  }, [clearSelection]);

  // Inicializar partida y cargar puntuaciones
  useEffect(() => {
    const chess = new Chess();
    gameRef.current = chess;
    setFen(chess.fen());
    loadScores();
  }, [loadScores]);

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
            onClick={resetGame}
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
                min={800}
                max={2200}
                step={1}
                valueLabelDisplay="auto"
                disabled={gameStarted}
                marks={[
                  { value: 800, label: "800" },
                  { value: 2200, label: "2200" },
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
                color="textSecondary"
                sx={{ visibility: isAIThinking ? "visible" : "hidden" }}
              >
                🤔 AI is thinking...
              </Typography>

              <Typography
                variant="body2"
                color="error"
                sx={{ visibility: scoreError ? "visible" : "hidden" }}
              >
                {scoreError || "placeholder"}
              </Typography>
            </Box>
          </>
        ) : (
          <Box sx={{ width: "100%", maxWidth: 600, px: 2 }}>
            {topScores.length > 0 ? (
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
                      {topScores
                        .sort((a, b) => b.elo - a.elo)
                        .slice(0, 10)
                        .map((score, index) => (
                          <TableRow key={index} hover>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>{score.name}</TableCell>
                            <TableCell>{score.elo}</TableCell>
                            <TableCell>
                              {new Date(score.time).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {scoreError && (
                  <Typography variant="body2" color="error" sx={{ mt: 2 }}>
                    {scoreError}
                  </Typography>
                )}
              </>
            ) : (
              <Typography variant="body1" color="textSecondary">
                {scoreError || "No scores yet. Play a game!"}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </>
  );
};

export default ChessGame;