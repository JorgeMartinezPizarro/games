'use client'

import { Box, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import React, { useCallback, useEffect, useState } from "react";
import "./styles.css";
import { CellValues } from "./types";
import { randomArrayCellValues, hasSolution } from "./helpers";
import MainMenu from "@/app/components/MainMenu";
import { errorMessage } from "@/app/helpers";

const GamesComponent = () => {
  const [start, setStart] = useState(Date.now())
  const [view, setView] = useState<'play' | 'scores'>('play')
  const [loading, setLoading] = useState(false)
  const [isRight, setIsRight] = useState(true)
  const [last, setLast] = useState<CellValues | undefined>(undefined)
  const [numbers, setNumbers] = useState<CellValues[]>([])
  const [steps, setSteps] = useState<number>(0)
  const [time, setTime] = useState<number>(Date.now())
  const [topScores, setTopScores] = useState<any[]>([])
  const [error, setError] = useState<string | undefined>(undefined)
  const [scoreSaved, setScoreSaved] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Score visible en UI — sigue dependiendo del estado para el display
  const currentScore = time - start === 0
    ? 0
    : Math.round(steps ** 3 * 1000 / (time - start))

  useEffect(() => {
    setMounted(true)
  }, [])

  // Recibe los valores finales como parámetros para evitar el problema de closure
  const saveScore = useCallback(async (finalScore: number, finalSteps: number) => {
    if (scoreSaved) return

    try {
      const response = await fetch("/bookmarks/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: 2,
          score: finalScore,
          gameConfig: { steps: finalSteps }
        }),
      })

      if (response.ok) {
        setScoreSaved(true)
        await loadScores()
      }
    } catch (error) {
      console.error("Error saving score:", error)
    }
  }, [scoreSaved]) // loadScores se añade abajo tras definirla

  const loadScores = useCallback(async () => {
    setError(undefined)
    try {
      const response = await fetch("/bookmarks/api/scores?gameId=2")
      const data = await response.json()

      if (data.scores) {
        setTopScores(data.scores.map((score: any) => ({
          score: score.score,
          steps: score.gameConfig?.steps || 0,
          name: score.username,
          time: score.createdAt
        })))
      }
    } catch (e: any) {
      setError(e.message || "Error loading scores")
    }
  }, [])

  const isBlocked = useCallback((currentCell: CellValues, updatedNumbers: CellValues[]): boolean => {
    const jump = currentCell.values.n
    const pos = currentCell.values.i
    const n = updatedNumbers.length

    const next = (pos + jump) % n
    const prev = (pos - jump + n) % n

    return updatedNumbers[next]?.values.b && updatedNumbers[prev]?.values.b
  }, [])

  const handleClick = useCallback((cell: CellValues): boolean => {
    const clickIsRight = !cell.values.b && isRight && (
      last === undefined ||
      (20 + last.values.i - cell.values.i) % 20 === last.values.n ||
      (20 - last.values.i + cell.values.i) % 20 === last.values.n
    )

    if (!clickIsRight) {
      // Calcular score final con los valores actuales del closure (sin +1)
      const finalSteps = steps
      const finalTime = Date.now()
      const elapsed = finalTime - start
      const finalScore = elapsed === 0 ? 0 : Math.round(finalSteps ** 3 * 1000 / elapsed)
      saveScore(finalScore, finalSteps)
      setIsRight(false)
      setLast(undefined)
      return true
    }

    const newNumbers = numbers.map(r =>
      r.values.i !== cell.values.i
        ? { ...r }
        : { values: { ...r.values, b: true } }
    )

    const newStart = last === undefined ? Date.now() : start
    const newTime = Date.now()
    const newSteps = steps + 1

    if (last === undefined) setStart(newStart)
    setTime(newTime)
    setNumbers(newNumbers)
    setSteps(newSteps)
    setLast({ ...cell })

    // Completó todas las casillas
    if (newSteps === 20) {
      const elapsed = newTime - newStart
      const finalScore = elapsed === 0 ? 0 : Math.round(newSteps ** 3 * 1000 / elapsed)
      saveScore(finalScore, newSteps)
      return false
    }

    // Detectar bloqueo
    const updatedCell = { values: { ...cell.values, b: true } }
    if (isBlocked(updatedCell, newNumbers)) {
      const elapsed = newTime - newStart
      const finalScore = elapsed === 0 ? 0 : Math.round(newSteps ** 3 * 1000 / elapsed)
      saveScore(finalScore, newSteps)
      setIsRight(false)
      setLast(undefined)
    }

    return false
  }, [last, steps, start, numbers, isRight, saveScore, isBlocked])

  const newNumbers = [...numbers]
  const [topRow, rightCol, bottomRow, leftCol] = [
    newNumbers.slice(0, 6),
    newNumbers.slice(6, 10),
    newNumbers.slice(10, 16).reverse(),
    newNumbers.slice(16, 20).reverse()
  ]

  const newGame = useCallback(() => {
    setLoading(true)
    setIsRight(true)
    setLast(undefined)
    setSteps(0)
    setScoreSaved(false)

    let cells = randomArrayCellValues(20)
    let attempts = 0
    while (!hasSolution(cells) && attempts < 200) {
      cells = randomArrayCellValues(20)
      attempts++
    }

    setNumbers(cells)
    setTimeout(() => {
      setStart(Date.now())
      setLoading(false)
      setTime(Date.now())
    }, 150)
  }, [])

  useEffect(() => {
    loadScores()
    const timer = setTimeout(() => newGame(), 25)
    return () => clearTimeout(timer)
  }, [loadScores, newGame])

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

  const getCenterButtonText = (rowIndex: number, colIndex: number) => {
    if (steps === 0 && rowIndex === 1 && colIndex === 1) return "Let's"
    if (steps === 0 && rowIndex === 1 && colIndex === 2) return "Play"
    if (!isRight && rowIndex === 1 && colIndex === 1) return "GAME"
    if (!isRight && rowIndex === 1 && colIndex === 2) return "OVER"
    return ""
  }

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

        {view === 'play' && numbers.length === 20 && (
          <Box className={"box" + (loading ? " loading" : "")}>
            <Box className="controls">
              <Button className={"arcade-btn" + (!isRight ? " danger" : "")} onClick={newGame}>Reset</Button>
              <Button className="arcade-btn" disabled>Score</Button>
              <Button className="arcade-btn" disabled>{currentScore}</Button>
              <Button className="arcade-btn" disabled>Steps</Button>
              <Button className="arcade-btn" disabled>{steps}</Button>
              {isRight ? (
                <Button className="arcade-btn" disabled>{}</Button>
              ) : (
                <Button className="arcade-btn danger" disabled>💀</Button>
              )}
            </Box>

            {topRow.map(number => (
              <Box key={`top-${number.values.i}`} className="cell-border">
                <Button
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
                    className={"arcade-btn" + (!isRight ? " danger" : "")}
                    color={leftCol[rowIndex].values.b ? "secondary" : "primary"}
                    disabled={loading || !isRight || leftCol[rowIndex].values.b}
                    onClick={() => handleClick(leftCol[rowIndex])}
                  >
                    {leftCol[rowIndex].values.n}
                  </Button>
                </Box>

                {[0, 1, 2, 3].map(colIndex => (
                  <Box key={`center-${rowIndex}-${colIndex}`} className="cell-center">
                    <Button disabled className={"arcade-btn" + (!isRight ? " danger" : "")}>
                      {getCenterButtonText(rowIndex, colIndex)}
                    </Button>
                  </Box>
                ))}

                <Box key={`right-${rowIndex}`} className="cell-border">
                  <Button
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

            {bottomRow.map(number => (
              <Box key={`bot-${number.values.i}`} className="cell-border">
                <Button
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
                      .map((entry, i) => (
                        <TableRow
                          key={i}
                          sx={{
                            '&:nth-of-type(odd)': { bgcolor: 'rgba(255,255,255,0.03)' },
                            '&:hover': { bgcolor: 'rgba(21, 101, 192, 0.12)' }
                          }}
                        >
                          <TableCell align="center" sx={{ color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{i + 1}</TableCell>
                          <TableCell sx={{ color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{entry.name}</TableCell>
                          <TableCell align="right" sx={{ color: '#4caf50', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{entry.score}</TableCell>
                          <TableCell align="right" sx={{ color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{entry.steps}</TableCell>
                        </TableRow>
                      ))}
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
                      .map((entry, i) => (
                        <TableRow
                          key={i}
                          sx={{
                            '&:nth-of-type(odd)': { bgcolor: 'rgba(255,255,255,0.03)' },
                            '&:hover': { bgcolor: 'rgba(123, 31, 162, 0.12)' }
                          }}
                        >
                          <TableCell align="center" sx={{ color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{i + 1}</TableCell>
                          <TableCell sx={{ color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{entry.name}</TableCell>
                          <TableCell align="right" sx={{ color: '#ff9800', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{entry.steps}</TableCell>
                          <TableCell align="right" sx={{ color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{entry.score}</TableCell>
                        </TableRow>
                      ))}
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