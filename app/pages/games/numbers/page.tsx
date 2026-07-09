'use client'

import { Box, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import "./styles.css";
import MainMenu from "@/app/components/MainMenu";
import { errorMessage } from "@/app/helpers";
import { useNumbers } from "@/app/hooks/useNumbers";
import {useScoreNumbers} from "@/app/hooks/useScoreNumbers"

const GamesComponent = () => {
  const [view, setView] = useState<'play' | 'scores'>('play')
  const [mounted, setMounted] = useState(false)

  const { topScores, error, loadScores, saveScore, resetScore, recordEntry, myRank } = useScoreNumbers()

  const {
    numbers,
    steps,
    isRight,
    loading,
    currentScore,
    handleClick,
    newGame,
  } = useNumbers({
    onFinish: saveScore,
    onReset: resetScore,
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  const newNumbers = [...numbers]
  const [topRow, rightCol, bottomRow, leftCol] = [
    newNumbers.slice(0, 6),
    newNumbers.slice(6, 10),
    newNumbers.slice(10, 16).reverse(),
    newNumbers.slice(16, 20).reverse()
  ]

  // La partida ya NO arranca sola al montar: el jugador la arranca pulsando
  // el botón PLAY (ver más abajo), que dispara newGame() directamente. Así
  // los números quedan ocultos hasta que decide empezar, y el cronómetro
  // del score (que arranca en cuanto llega el tablero, ver useNumbers.ts)
  // coincide con el momento real en que se revela.
  useEffect(() => {
    loadScores()
  }, [loadScores])

  if (!mounted) {
    return (
      <>
        <MainMenu />
        <Box sx={{ color: "white", textAlign: "center", mt: 4 }}>
          <Typography variant="h4">Loading Numbers Game...</Typography>
        </Box>
      </>
    )
  }

  const gameStarted = steps > 0 || !isRight
  const gameOver = steps === 20 || !isRight

  return (
    <>
      <MainMenu />

      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2, mt: 1 }}>
        <Button
          onClick={() => setView(view === 'play' ? 'scores' : 'play')}
          className={
            "arcade-btn arcade-toggle-btn" +
            (view === "scores" ? " selected" : "")
          }
          sx={{
            borderRadius: '30px',
            fontSize: '1.05rem',
            px: 5,
            py: 1.5,
            fontWeight: 900,
            mt: 2,
            boxShadow: '0 0 24px #00e6ff, 0 4px 18px #222 inset',
            background: view === "play"
              ? "linear-gradient(90deg,#43e97b 0%,#38f9d7 100%)"
              : "linear-gradient(90deg,#ff7b7b 0%,#ffb199 100%)",
            color: "#181818",
            textShadow: '0 1px #fff, 0 2px #10abff',
            transition: 'all 0.17s cubic-bezier(.68,-.55,.27,1.55)'
          }}
        >
          {view === "scores" ? "🎮 PLAY" : "🏆 SCORES"}
        </Button>
      </Box>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(100vh - 160px)",
          textAlign: "center",
          width: "100%",
          padding: "8px"
        }}
      >
        {error && <pre style={{ color: "red" }}>{errorMessage(error)}</pre>}

        {view === 'play' && numbers.length !== 20 && (
          <Box className="play-gate">
            <Typography variant="h3" className="play-gate-title">
              🔢 Numbers
            </Typography>
            <Typography className="play-gate-subtitle">
              Recorre las 20 casillas saltando la distancia exacta que marca
              cada número, sin repetir ninguna. El reloj arranca en cuanto
              pulses PLAY.
            </Typography>
            <Button
              data-testid="play-btn"
              className="arcade-btn play-btn"
              onClick={newGame}
              disabled={loading}
            >
              {loading ? "Cargando…" : "▶ PLAY"}
            </Button>
          </Box>
        )}

        {view === 'play' && numbers.length === 20 && (
          <Box className={"box" + (loading ? " loading" : "")}>
            {topRow.map(number => (
              <Box key={`top-${number.values.i}`} className="cell-border">
                <Button
                  data-testid={`cell-${number.values.i}`}
                  className={"arcade-btn" + (!isRight ? " danger" : "")}
                  color={number.values.b ? "secondary" : "primary"}
                  disabled={loading || !isRight || number.values.b}
                  onClick={() => handleClick(number)}
                >
                  {number.values.n}
                </Button>
              </Box>
            ))}

            {[0, 1, 2, 3].map(rowIndex => (
              <React.Fragment key={`mid-row-${rowIndex}`}>
                <Box key={`left-${rowIndex}`} className="cell-border">
                  <Button
                    data-testid={`cell-${leftCol[rowIndex].values.i}`}
                    className={"arcade-btn" + (!isRight ? " danger" : "")}
                    color={leftCol[rowIndex].values.b ? "secondary" : "primary"}
                    disabled={loading || !isRight || leftCol[rowIndex].values.b}
                    onClick={() => handleClick(leftCol[rowIndex])}
                  >
                    {leftCol[rowIndex].values.n}
                  </Button>
                </Box>

                {[0, 1, 2, 3].map(colIndex => (
                  <Box key={`center-${rowIndex}-${colIndex}`} className="cell-center" />
                ))}

                <Box key={`right-${rowIndex}`} className="cell-border">
                  <Button
                    data-testid={`cell-${rightCol[rowIndex].values.i}`}
                    className={"arcade-btn" + (!isRight ? " danger" : "")}
                    color={rightCol[rowIndex].values.b ? "secondary" : "primary"}
                    disabled={loading || !isRight || rightCol[rowIndex].values.b}
                    onClick={() => handleClick(rightCol[rowIndex])}
                  >
                    {rightCol[rowIndex].values.n}
                  </Button>
                </Box>
              </React.Fragment>
            ))}

            <Box className="center-panel">
              {!gameStarted ? (
                <Typography className="center-panel-hint">¡Let&apos;s Play!</Typography>
              ) : (
                <>
                  <Typography className="center-panel-label">Score</Typography>
                  <Typography data-testid="score-value" className="center-panel-value">{currentScore}</Typography>
                  <Typography className="center-panel-label">Steps</Typography>
                  <Typography data-testid="steps-value" className="center-panel-value center-panel-value-steps">{steps}</Typography>
                  {gameOver && (
                    <Typography className={"center-panel-status" + (!isRight ? " danger" : " win")}>
                      {!isRight ? "💀 GAME OVER" : "🏆 ¡COMPLETADO!"}
                    </Typography>
                  )}
                  {gameOver && myRank && (
                    <Typography
                      className={"center-panel-rank" + (myRank.rank <= 10 ? " center-panel-rank-top10" : "")}
                    >
                      Tu posición: #{myRank.rank} de {myRank.total}
                    </Typography>
                  )}
                </>
              )}
              <Button
                data-testid="reset-btn"
                className={
                  "arcade-btn center-reset-btn" +
                  (!isRight ? " danger" : "") +
                  (gameOver ? " reset-btn-prominent" : "")
                }
                onClick={newGame}
              >
                {gameOver ? "🔄 REINTENTAR" : "🔄 RESET"}
              </Button>
            </Box>

            {bottomRow.map(number => (
              <Box key={`bot-${number.values.i}`} className="cell-border">
                <Button
                  data-testid={`cell-${number.values.i}`}
                  className={"arcade-btn" + (!isRight ? " danger" : "")}
                  color={number.values.b ? "secondary" : "primary"}
                  disabled={loading || !isRight || number.values.b}
                  onClick={() => handleClick(number)}
                >
                  {number.values.n}
                </Button>
              </Box>
            ))}
          </Box>
        )}

        {view === 'scores' && topScores.length > 0 && (
          <Box sx={{ width: '100%', maxWidth: 600, px: 2 }}>
            <Paper elevation={3} sx={{ mb: 3, overflow: 'hidden', bgcolor: '#1a1a2e' }}>
              <Typography variant="h6" sx={{ p: 2, bgcolor: '#1565c0', color: 'white', textAlign: 'center' }}>
                🏆 Highest Scores
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'rgba(21, 101, 192, 0.15)' }}>
                      <TableCell align="center" sx={{ fontWeight: 'bold', color: '#e0e0e0' }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', color: '#e0e0e0' }}>Player</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold', color: '#e0e0e0' }}>Score</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold', color: '#e0e0e0' }}>Steps</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topScores
                      .sort((a, b) => b.score - a.score)
                      .slice(0, 10)
                      .map((entry, i) => {
                        const isRecord = Boolean(
                          recordEntry && entry.score === recordEntry.score && entry.steps === recordEntry.steps
                        );
                        // Fila de récord: fondo dorado sólido + texto marino oscuro,
                        // no gris claro (#e0e0e0 sobre amarillo pastel era casi ilegible).
                        const cellColor = isRecord ? '#1a1a2e' : '#e0e0e0';
                        return (
                          <TableRow
                            key={i}
                            sx={{
                              '&:nth-of-type(odd)': { bgcolor: 'rgba(255,255,255,0.03)' },
                              '&:hover': { bgcolor: 'rgba(21, 101, 192, 0.12)' },
                              ...(isRecord ? { bgcolor: '#ffc400 !important' } : {}),
                            }}
                          >
                            <TableCell align="center" sx={{ color: cellColor, fontWeight: isRecord ? 700 : 400, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{i + 1}</TableCell>
                            <TableCell sx={{ color: cellColor, fontWeight: isRecord ? 700 : 400, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{entry.userId}</TableCell>
                            <TableCell align="right" sx={{ color: isRecord ? cellColor : '#4caf50', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{entry.score}</TableCell>
                            <TableCell align="right" sx={{ color: cellColor, fontWeight: isRecord ? 700 : 400, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{entry.steps}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            <Paper elevation={3} sx={{ overflow: 'hidden', bgcolor: '#1a1a2e' }}>
              <Typography variant="h6" sx={{ p: 2, bgcolor: '#7b1fa2', color: 'white', textAlign: 'center' }}>
                🔥 Most Steps
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'rgba(123, 31, 162, 0.15)' }}>
                      <TableCell align="center" sx={{ fontWeight: 'bold', color: '#e0e0e0' }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', color: '#e0e0e0' }}>Player</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold', color: '#e0e0e0' }}>Steps</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold', color: '#e0e0e0' }}>Score</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topScores
                      .sort((a, b) => b.steps - a.steps)
                      .slice(0, 10)
                      .map((entry, i) => {
                        const isRecord = Boolean(
                          recordEntry && entry.score === recordEntry.score && entry.steps === recordEntry.steps
                        );
                        // Fila de récord: fondo dorado sólido + texto marino oscuro,
                        // no gris claro (#e0e0e0 sobre amarillo pastel era casi ilegible).
                        const cellColor = isRecord ? '#1a1a2e' : '#e0e0e0';
                        return (
                          <TableRow
                            key={i}
                            sx={{
                              '&:nth-of-type(odd)': { bgcolor: 'rgba(255,255,255,0.03)' },
                              '&:hover': { bgcolor: 'rgba(123, 31, 162, 0.12)' },
                              ...(isRecord ? { bgcolor: '#ffc400 !important' } : {}),
                            }}
                          >
                            <TableCell align="center" sx={{ color: cellColor, fontWeight: isRecord ? 700 : 400, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{i + 1}</TableCell>
                            <TableCell sx={{ color: cellColor, fontWeight: isRecord ? 700 : 400, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{entry.userId}</TableCell>
                            <TableCell align="right" sx={{ color: isRecord ? cellColor : '#ff9800', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{entry.steps}</TableCell>
                            <TableCell align="right" sx={{ color: cellColor, fontWeight: isRecord ? 700 : 400, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{entry.score}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        )}

        {view === 'scores' && topScores.length === 0 && !error && (
          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.6)', mt: 4 }}>
            No scores yet. Play the game!
          </Typography>
        )}
      </Box>
    </>
  )
}

export default GamesComponent
