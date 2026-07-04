"use client"

import { useCallback, useState } from "react"
import { CellValues, RecordEntry, UseNumbersConfig } from "@/app/types"


export function useNumbers(config: UseNumbersConfig = {}) {
  const { onFinish, onReset } = config

  const [start, setStart] = useState<number>(Date.now())
  const [loading, setLoading] = useState(false)
  const [isRight, setIsRight] = useState(true)
  const [last, setLast] = useState<CellValues | undefined>(undefined)
  const [numbers, setNumbers] = useState<CellValues[]>([])
  const [steps, setSteps] = useState<number>(0)
  const [time, setTime] = useState<number>(Date.now())
  const [moves, setMoves] = useState<number[]>([])
  const [nonce, setNonce] = useState<string | null>(null)
  const [initialBoard, setInitialBoard] = useState<CellValues[]>([])
  // Score calculado localmente en vivo, hasta que el backend confirme el
  // suyo (fuente de verdad) al terminar la partida.
  const [confirmedScore, setConfirmedScore] = useState<number | null>(null)

  const liveScore =
    time - start === 0 ? 0 : Math.round((steps ** 3 * 3500) / (time - start))
  const currentScore = confirmedScore ?? liveScore

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

  const finish = useCallback(
    (finalScore: number, finalSteps: number, finalMoves: number[]) => {
      const result = onFinish?.(finalScore, finalSteps, finalMoves, nonce, initialBoard)
      if (result && typeof (result as Promise<number | null>).then === "function") {
        (result as Promise<number | null>).then(confirmed => {
          if (typeof confirmed === "number") setConfirmedScore(confirmed)
        })
      }
    },
    [onFinish, nonce, initialBoard],
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
          elapsed === 0 ? 0 : Math.round((finalSteps ** 3 * 3500) / elapsed)

        finish(finalScore, finalSteps, moves)

        setIsRight(false)
        setLast(undefined)
        return true
      }

      const newNumbers = numbers.map(r =>
        r.values.i !== cell.values.i
          ? { ...r }
          : { values: { ...r.values, b: true } },
      )

      const newTime = Date.now()
      const newSteps = steps + 1
      const newMoves = [...moves, cell.values.i]

      setTime(newTime)
      setNumbers(newNumbers)
      setSteps(newSteps)
      setMoves(newMoves)
      setLast({ ...cell })

      // Completó todas las casillas
      if (newSteps === 20) {
        const elapsed = newTime - start
        const finalScore =
          elapsed === 0 ? 0 : Math.round((newSteps ** 3 * 3500) / elapsed)
        finish(finalScore, newSteps, newMoves)
        return false
      }

      // Detectar bloqueo
      const updatedCell: CellValues = {
        values: { ...cell.values, b: true },
      }
      if (isBlocked(updatedCell, newNumbers)) {
        const elapsed = newTime - start
        const finalScore =
          elapsed === 0 ? 0 : Math.round((newSteps ** 3 * 3500) / elapsed)

        finish(finalScore, newSteps, newMoves)

        setIsRight(false)
        setLast(undefined)
      }

      return false
    },
    [isRight, last, steps, start, numbers, moves, isBlocked, finish],
  )

  const newGame = useCallback(async () => {
    setLoading(true)
    setIsRight(true)
    setLast(undefined)
    setSteps(0)
    setMoves([])
    setNonce(null)
    setConfirmedScore(null)
    onReset?.()

    try {
      const response = await fetch("/bookmarks/api/numbers/new-game", {
        method: "POST",
      })
      if (!response.ok) throw new Error("Failed to start a new game")

      const data = await response.json()
      // El cronómetro arranca en cuanto llega el tablero, igual que el
      // servidor arranca el suyo al crear el nonce (stored.createdAt en
      // app/lib/numbers/db.ts). Si esperáramos al primer click, el score
      // mostrado en pantalla no coincidiría con el que valida y guarda el
      // backend.
      const now = Date.now()
      setNumbers(data.board)
      setInitialBoard(data.board)
      setNonce(data.nonce)
      setStart(now)
      setTime(now)
    } catch (error) {
      console.error("Error starting new game:", error)
    }

    setTimeout(() => setLoading(false), 150)
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
