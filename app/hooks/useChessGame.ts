"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, Square } from "chess.js";

export interface UseChessGameOptions {
  /**
   * Se llama cuando el servidor confirma que la partida terminó y el
   * jugador (blancas) dio jaque mate, con el nonce de la partida para que
   * pueda guardarse la puntuación.
   */
  onPlayerWin?: (nonce: string) => void;
  /** Se llama cada vez que arranca una partida nueva (reset manual o por desincronización). */
  onReset?: () => void;
}

export function useChessGame({ onPlayerWin, onReset }: UseChessGameOptions = {}) {
  const gameRef = useRef<Chess | null>(null);
  const nonceRef = useRef<string | null>(null);
  const [fen, setFen] = useState("start");
  const [elo, setElo] = useState(400);
  const [gameResult, setGameResult] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);

  // --- Sistema de dos clics ---
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, any>>({});

  const handleEloChange = useCallback(
    (_event: Event, newValue: number | number[]) => {
      if (!gameStarted) {
        setElo(newValue as number);
      }
    },
    [gameStarted]
  );

  // Manejar fin de partida
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

  // Reiniciar partida. keepError permite conservar el mensaje de error que
  // acaba de fijar el llamante (p.ej. tras una desincronización con el
  // servidor): sin esto, el reset lo borraba en el mismo tick en que se
  // ponía y el usuario nunca llegaba a verlo.
  const resetGame = useCallback(
    (options?: { keepError?: boolean }) => {
      const newGame = new Chess();
      gameRef.current = newGame;
      nonceRef.current = null;
      setFen("start");
      setGameResult(null);
      setGameStarted(false);
      setIsAIThinking(false);
      setIsGameOver(false);
      if (!options?.keepError) setGameError(null);
      clearSelection();
      onReset?.();
    },
    [clearSelection, onReset]
  );

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
        // Solo se llama a onPlayerWin si el jugador (blancas) dio jaque mate:
        // /api/scores es quien impone esto de verdad (recalcula isCheckmate()
        // sobre su propio log, nunca confía en este chequeo local), pero
        // evitamos aquí la llamada -y el error genérico "inténtalo de
        // nuevo"- en tablas o derrota, que nunca podrán guardarse.
        if (data.gameOver) {
          const playerWon = game.isCheckmate() && game.turn() === "b";
          if (playerWon) {
            onPlayerWin?.(currentNonce);
          }
        }
      } catch (error) {
        console.error("Error validando la jugada con el servidor:", error);
        setGameError("La partida se desincronizó con el servidor. Reiniciando la partida.");
        resetGame({ keepError: true });
      } finally {
        setIsAIThinking(false);
      }
    },
    [ensureGameSession, handleGameOver, resetGame, onPlayerWin]
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

  // Inicializar partida
  useEffect(() => {
    const chess = new Chess();
    gameRef.current = chess;
    setFen(chess.fen());
  }, []);

  return {
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
  };
}
