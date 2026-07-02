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
  const nonceRef = useRef<string | null>(null);
  const [fen, setFen] = useState("start");
  const [elo, setElo] = useState(400);
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

  // Guardar puntuación: el score ya no lo manda el cliente, solo el nonce
  // de la partida. El servidor reproduce el log de jugadas guardado bajo
  // ese nonce (grabado jugada a jugada por /api/chess) y calcula el score
  // él mismo a partir del elo con el que realmente se jugó.
  const saveScore = useCallback(async () => {
    if (scoreSaved) return;
    setScoreError(null);
    const currentNonce = nonceRef.current;
    if (!currentNonce) {
      setScoreError("No se pudo guardar la puntuación: no hay partida registrada.");
      return;
    }
    try {
      const response = await fetch("/bookmarks/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: 1,
          nonce: currentNonce,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Error al guardar la puntuación");
      }
      setScoreSaved(true);
      nonceRef.current = null;
      await loadScores(); // Actualiza la tabla de puntuaciones
    } catch (error) {
      console.error("Error saving score:", error);
      setScoreError("No se pudo guardar la puntuación. Inténtalo de nuevo.");
    }
  }, [scoreSaved, loadScores]);

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

  // Limpia selección y resaltado de casillas (común a drag y a clic)
  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setOptionSquares({});
  }, []);

  // Reiniciar partida
  const resetGame = useCallback(() => {
    const newGame = new Chess();
    gameRef.current = newGame;
    nonceRef.current = null;
    setFen("start");
    setGameResult(null);
    setGameStarted(false);
    setScoreSaved(false);
    setIsAIThinking(false);
    setIsGameOver(false);
    setScoreError(null);
    clearSelection();
  }, [clearSelection]);

  // Se llama antes de la primera jugada: pide al servidor un nonce que ata
  // la partida al elo elegido. A partir de aquí el servidor es la única
  // autoridad sobre el elo real de la IA y sobre el log de jugadas.
  const ensureGameSession = useCallback(async (): Promise<string> => {
    if (nonceRef.current) return nonceRef.current;

    const response = await fetch("/bookmarks/api/chess/new-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elo }),
    });
    const data = await response.json();
    if (!response.ok || !data.nonce) {
      throw new Error(data.error || "No se pudo iniciar la partida.");
    }
    nonceRef.current = data.nonce;
    return data.nonce;
  }, [elo]);

  // Manda la jugada del jugador a /api/chess: el servidor la valida contra
  // su propia reconstrucción del tablero (nunca confía en el FEN local),
  // la graba, y si la partida sigue en curso invoca a Stockfish él mismo y
  // devuelve su respuesta ya grabada también. Si el servidor y el cliente
  // llegasen a discrepar (nonce caducado, red, etc.) no hay forma segura de
  // reconciliar el tablero local con el registro del servidor, así que se
  // trata como error fatal y se reinicia la partida.
  const submitPlayerMove = useCallback(
    async (from: string, to: string) => {
      const game = gameRef.current;
      if (!game) return;

      setIsAIThinking(true);
      try {
        const currentNonce = await ensureGameSession();

        const response = await fetch("/bookmarks/api/chess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nonce: currentNonce, move: { from, to, promotion: "q" } }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "No se pudo validar la jugada.");
        }

        if (data.bestmove) {
          const aiFrom = data.bestmove.slice(0, 2);
          const aiTo = data.bestmove.slice(2, 4);
          const aiPromotion = data.bestmove.length === 5 ? data.bestmove.slice(4) : "q";

          try {
            const move = game.move({ from: aiFrom, to: aiTo, promotion: aiPromotion });

            if (move) {
              const newFen = game.fen();
              setFen(newFen);

              if (game.isGameOver()) {
                handleGameOver(game);
              }
            }
          } catch (moveError) {
            // El servidor ya validó esta jugada con chess.js antes de
            // devolverla; si aun así no se puede aplicar aquí, el estado
            // local y el del servidor han divergido.
            throw moveError;
          }
        }

        // El nonce solo puede guardarse una vez el servidor confirma que la
        // jugada final quedó grabada (data.gameOver, presente tanto si el
        // mate lo dio el jugador -bestmove null- como si lo dio la IA).
        // Disparar el guardado antes de esta respuesta es lo que causaba la
        // carrera: /api/scores consumía el nonce (de un solo uso) mientras
        // esta petición seguía en vuelo, y luego esta petición fallaba
        // porque el nonce ya no existía.
        //
        // Solo se llama a saveScore() si el jugador (blancas) dio jaque mate:
        // /api/scores es quien impone esto de verdad (recalcula isCheckmate()
        // sobre su propio log, nunca confía en este chequeo local), pero
        // evitamos aquí la llamada -y el error genérico "inténtalo de
        // nuevo"- en tablas o derrota, que nunca podrán guardarse.
        if (data.gameOver) {
          const playerWon = game.isCheckmate() && game.turn() === "b";
          if (playerWon) {
            saveScore();
          }
        }
      } catch (error) {
        console.error("Error validando la jugada con el servidor:", error);
        setScoreError("La partida se desincronizó con el servidor. Reiniciando la partida.");
        resetGame();
      } finally {
        setIsAIThinking(false);
      }
    },
    [ensureGameSession, handleGameOver, resetGame, saveScore]
  );

  // Intenta realizar un movimiento local; ignora silenciosamente si es
  // inválido (misclick). La validación real y autoritativa ocurre en el
  // servidor via submitPlayerMove — esto solo da feedback visual instantáneo.
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

        const isOver = game.isGameOver();
        if (isOver) {
          handleGameOver(game);
        } else {
          setIsAIThinking(true);
        }
        // Siempre se manda la jugada al servidor, incluso si la partida
        // termina localmente: es la única forma de que quede grabada en el
        // log autoritativo antes de poder guardar el score.
        setTimeout(() => submitPlayerMove(from, to), isOver ? 0 : 300);
        return true;
      } catch (e) {
        // chess.js (v1+) lanza excepción en movimientos ilegales: la capturamos
        // y la tratamos igual que un misclick, sin romper la UI.
        console.warn("Movimiento inválido ignorado:", e);
        return false;
      }
    },
    [gameStarted, handleGameOver, submitPlayerMove]
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