"use client"

import { useCallback, useState } from "react"
import { CellValues } from "./types"
import { hasSolution, randomArrayCellValues } from "./helpers"

interface UseNumbersConfig {
  onFinish?: (finalScore: number, finalSteps: number) => void
  onReset?: () => void
}

export function useScoreNumbers() {
  const [topScores, setTopScores] = useState<any[]>([])
  const [error, setError] = useState<string | undefined>(undefined)

  // Evita duplicar envíos mientras no se reinicie la partida
  const [scoreSaved, setScoreSaved] = useState(false)

  const loadScores = useCallback(async () => {
    setError(undefined)
    try {
      const response = await fetch("/bookmarks/api/scores?gameId=2")
      const data = await response.json()

      if (data.scores) {
        setTopScores(
          data.scores.map((score: any) => ({
            score: score.score,
            steps: score.gameConfig?.steps || 0,
            name: score.username,
            time: score.createdAt,
          })),
        )
      }
    } catch (e: any) {
      setError(e.message || "Error loading scores")
    }
  }, [])

  const saveScore = useCallback(
    async (finalScore: number, finalSteps: number) => {
      if (scoreSaved) return

      try {
        const response = await fetch("/bookmarks/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameId: 2,
            score: finalScore,
            gameConfig: { steps: finalSteps },
          }),
        })

        if (response.ok) {
          setScoreSaved(true)
          await loadScores()
        }
      } catch (error) {
        console.error("Error saving score:", error)
      }
    },
    [scoreSaved, loadScores],
  )

  const resetScore = useCallback(() => {
    setScoreSaved(false)
  }, [])

  return { topScores, error, loadScores, saveScore, resetScore }
}

export function useNumbers(config: UseNumbersConfig = {}) {
  const { onFinish, onReset } = config

  const [start, setStart] = useState<number>(Date.now())
  const [loading, setLoading] = useState(false)
  const [isRight, setIsRight] = useState(true)
  const [last, setLast] = useState<CellValues | undefined>(undefined)
  const [numbers, setNumbers] = useState<CellValues[]>([])
  const [steps, setSteps] = useState<number>(0)
  const [time, setTime] = useState<number>(Date.now())

  const currentScore =
    time - start === 0 ? 0 : Math.round((steps ** 3 * 1000) / (time - start))

  const isBlocked = useCallback(
    (currentCell: CellValues, updatedNumbers: CellValues[]): boolean => {
      const jump = currentCell.values.n
      const pos = currentCell.values.i
      const n = updatedNumbers.length

      const next = (pos + jump) % n
      const prev = (pos - jump + n) % n

      return Boolean(
        updatedNumbers[next]?.values.b && updatedNumbers[prev]?.values.b,
      )
    },
    [],
  )

  const handleClick = useCallback(
    (cell: CellValues): boolean => {
      const clickIsRight =
        !cell.values.b &&
        isRight &&
        (last === undefined ||
          ((20 + last.values.i - cell.values.i) % 20 === last.values.n ||
            (20 - last.values.i + cell.values.i) % 20 === last.values.n))

      if (!clickIsRight) {
        const finalSteps = steps
        const finalTime = Date.now()
        const elapsed = finalTime - start
        const finalScore =
          elapsed === 0 ? 0 : Math.round((finalSteps ** 3 * 1000) / elapsed)

        onFinish?.(finalScore, finalSteps)

        setIsRight(false)
        setLast(undefined)
        return true
      }

      const newNumbers = numbers.map(r =>
        r.values.i !== cell.values.i
          ? { ...r }
          : { values: { ...r.values, b: true } },
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
        const finalScore =
          elapsed === 0 ? 0 : Math.round((newSteps ** 3 * 1000) / elapsed)
        onFinish?.(finalScore, newSteps)
        return false
      }

      // Detectar bloqueo
      const updatedCell: CellValues = {
        values: { ...cell.values, b: true },
      }
      if (isBlocked(updatedCell, newNumbers)) {
        const elapsed = newTime - newStart
        const finalScore =
          elapsed === 0 ? 0 : Math.round((newSteps ** 3 * 1000) / elapsed)

        onFinish?.(finalScore, newSteps)

        setIsRight(false)
        setLast(undefined)
      }

      return false
    },
    [isRight, last, steps, start, numbers, isBlocked, onFinish],
  )

  const newGame = useCallback(() => {
    setLoading(true)
    setIsRight(true)
    setLast(undefined)
    setSteps(0)
    onReset?.()

    let cells = randomArrayCellValues(20)
    let attempts = 0
    while (!hasSolution(cells) && attempts < 200) {
      cells = randomArrayCellValues(20)
      attempts++
    }

    setNumbers(cells)
    setTimeout(() => {
      const now = Date.now()
      setStart(now)
      setLoading(false)
      setTime(now)
    }, 150)
  }, [onReset])

  return {
    numbers,
    steps,
    isRight,
    loading,
    currentScore,
    handleClick,
    newGame,
  }
}
