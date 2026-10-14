"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, Square } from "chess.js";

export type LastMove = { from: Square; to: Square };

// Square of the king of the side to move, if it is in check.
function findCheckedKing(game: Chess): Square | null {
  if (!game.inCheck()) return null;
  for (const row of game.board()) {
    for (const piece of row) {
      if (piece && piece.type === "k" && piece.color === game.turn()) return piece.square;
    }
  }
  return null;
}

export interface UseChessGameOptions {
  /**
   * Called when the server confirms the game is over and the player
   * (White) delivered checkmate, with the game's nonce so the score can
   * be saved.
   */
  onPlayerWin?: (nonce: string) => void;
  /** Called every time a new game starts (manual reset or after a desync). */
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
  // Rendering only: moves in SAN and the last move. They play no part in
  // validation, which is still the server's job.
  const [history, setHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);

  // --- Two-click system ---
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

  // Handle game over
  const handleGameOver = useCallback((game: Chess) => {
    let result = "";
    if (game.isCheckmate()) {
      result = game.turn() === "w" ? "AI wins (checkmate)" : "Player wins (checkmate)";
    } else if (game.isDraw()) {
      result = "Draw";
    } else if (game.isStalemate()) {
      result = "Draw (stalemate)";
    } else if (game.isThreefoldRepetition()) {
      result = "Draw (threefold repetition)";
    } else if (game.isInsufficientMaterial()) {
      result = "Draw (insufficient material)";
    }
    if (result) {
      setGameResult(result);
      setIsGameOver(true);
    }
  }, []);

  // Clears selection and square highlighting (shared by drag and click)
  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setOptionSquares({});
  }, []);

  // Restart the game. keepError keeps the error message the caller has just
  // set (e.g. after a desync with the server): without it, the reset cleared
  // it in the same tick it was set and the user never got to see it.
  const resetGame = useCallback(
    (options?: { keepError?: boolean }) => {
      const newGame = new Chess();
      gameRef.current = newGame;
      nonceRef.current = null;
      setFen("start");
      setHistory([]);
      setLastMove(null);
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

  // Called before the first move: asks the server for a nonce that binds the
  // game to the chosen elo. From here on the server is the sole authority
  // over the AI's actual elo and over the move log.
  const ensureGameSession = useCallback(async (): Promise<string> => {
    if (nonceRef.current) return nonceRef.current;

    const response = await fetch("/bookmarks/api/chess/new-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elo }),
    });
    const data = await response.json();
    if (!response.ok || !data.nonce) {
      throw new Error(data.error || "Couldn't start the game.");
    }
    nonceRef.current = data.nonce;
    return data.nonce;
  }, [elo]);

  // Sends the player's move to /api/chess: the server validates it against
  // its own reconstruction of the board (it never trusts the local FEN),
  // records it, and if the game is still ongoing it calls Stockfish itself
  // and returns its reply, also already recorded. If server and client ever
  // disagree (expired nonce, network, etc.) there is no safe way to
  // reconcile the local board with the server's record, so it is treated as
  // a fatal error and the game is restarted.
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
          throw new Error(data.error || "Couldn't validate the move.");
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
              setHistory(game.history());
              setLastMove({ from: move.from, to: move.to });

              if (game.isGameOver()) {
                handleGameOver(game);
              }
            }
          } catch (moveError) {
            // The server already validated this move with chess.js before
            // returning it; if it still can't be applied here, the local
            // state and the server's have diverged.
            throw moveError;
          }
        }

        // The nonce can only be saved once the server confirms the final
        // move was recorded (data.gameOver, present whether the mate was
        // delivered by the player -bestmove null- or by the AI).
        // Triggering the save before this response is what caused the
        // race: /api/scores consumed the (single-use) nonce while this
        // request was still in flight, and then this request failed
        // because the nonce no longer existed.
        //
        // onPlayerWin is only called if the player (White) delivered mate:
        // /api/scores is what actually enforces this (it recomputes
        // isCheckmate() over its own log, never trusting this local check),
        // but here we skip the call -and the generic "try again" error- on
        // draws or losses, which can never be saved.
        if (data.gameOver) {
          const playerWon = game.isCheckmate() && game.turn() === "b";
          if (playerWon) {
            onPlayerWin?.(currentNonce);
          }
        }
      } catch (error) {
        console.error("Error validating the move with the server:", error);
        setGameError("The game got out of sync with the server. Starting a new game.");
        resetGame({ keepError: true });
      } finally {
        setIsAIThinking(false);
      }
    },
    [ensureGameSession, handleGameOver, resetGame, onPlayerWin]
  );

  // Tries to make a local move; silently ignores it if it's invalid
  // (misclick). The real, authoritative validation happens on the server
  // via submitPlayerMove — this only gives instant visual feedback.
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
          // chess.js returned null/false: illegal move, ignore it as a misclick
          return false;
        }

        const newFen = game.fen();
        setFen(newFen);
        setHistory(game.history());
        setLastMove({ from: move.from, to: move.to });
        if (!gameStarted) setGameStarted(true);

        const isOver = game.isGameOver();
        if (isOver) {
          handleGameOver(game);
        } else {
          setIsAIThinking(true);
        }
        // The move is always sent to the server, even if the game ends
        // locally: it's the only way it gets recorded in the authoritative
        // log before the score can be saved.
        setTimeout(() => submitPlayerMove(from, to), isOver ? 0 : 300);
        return true;
      } catch (e) {
        // chess.js (v1+) throws on illegal moves: we catch it and treat it
        // just like a misclick, without breaking the UI.
        console.warn("Ignoring invalid move:", e);
        return false;
      }
    },
    [gameStarted, handleGameOver, submitPlayerMove]
  );

  // Shows the legal destination squares for the selected piece
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
          background: "rgba(245, 181, 68, 0.5)",
        },
      };

      // Dot on empty squares, ring on captures.
      moves.forEach((m) => {
        newSquares[m.to] = {
          background: game.get(m.to as Square)
            ? "radial-gradient(circle, transparent 58%, rgba(11, 14, 20, 0.3) 60%)"
            : "radial-gradient(circle, rgba(11, 14, 20, 0.3) 20%, transparent 22%)",
        };
      });

      setOptionSquares(newSquares);
    } catch (e) {
      // If computing the legal moves fails, we simply don't highlight anything
      console.warn("Couldn't compute legal moves:", e);
      setOptionSquares({});
    }
  }, []);

  // --- Click on a square (two-click system) ---
  const onSquareClick = useCallback(
    (square: Square) => {
      const game = gameRef.current;
      if (!game || isGameOver || isAIThinking) return;

      // Case 1: nothing was selected yet
      if (!selectedSquare) {
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
          setSelectedSquare(square);
          showOptionsForSquare(square);
        }
        return;
      }

      // Case 2: clicking the already-selected square -> deselect
      if (selectedSquare === square) {
        clearSelection();
        return;
      }

      // Case 3: a piece was already selected, try to move
      const moved = tryMove(selectedSquare, square);

      if (moved) {
        clearSelection();
        return;
      }

      // The move wasn't valid (misclick). If the click was on another own
      // piece, select that one instead; otherwise, deselect.
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

  // --- Drag & drop (still available alongside the click system) ---
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

  // Initialize the game
  useEffect(() => {
    const chess = new Chess();
    gameRef.current = chess;
    setFen(chess.fen());
  }, []);

  // Recomputed for every new position (fen changes after each move).
  const checkSquare = useMemo(
    () => (gameRef.current ? findCheckedKing(gameRef.current) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fen]
  );

  return {
    fen,
    elo,
    history,
    lastMove,
    checkSquare,
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
