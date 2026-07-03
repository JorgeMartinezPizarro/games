
import { useCallback, useState } from "react"
import { CellValues, RecordEntry, UseNumbersConfig } from "@/app/types"


export function useScoreNumbers() {
  const [topScores, setTopScores] = useState<any[]>([])
  const [error, setError] = useState<string | undefined>(undefined)

  // Evita duplicar envíos mientras no se reinicie la partida
  const [scoreSaved, setScoreSaved] = useState(false)

  // Marca la fila a resaltar en la lista cuando el score confirmado por el
  // backend supera el mejor score que había en el leaderboard hasta ahora.
  const [recordEntry, setRecordEntry] = useState<RecordEntry | null>(null)

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
			userId: score.userId ?? score.username,
			time: score.createdAt,
		  })),
		)
	  }
	} catch (e: any) {
	  setError(e.message || "Error loading scores")
	}
  }, [])

  // El score final lo decide siempre el backend (recalculado a partir del
  // nonce/tablero/movimientos validados): esto devuelve ese valor para que
  // useNumbers actualice lo que muestra en pantalla y ambos coincidan.
  const saveScore = useCallback(
	async (
	  _finalScore: number,
	  finalSteps: number,
	  moves: number[],
	  nonce: string | null,
	  board: CellValues[],
	): Promise<number | null> => {
	  if (scoreSaved || !nonce) return null

	  try {
		const response = await fetch("/bookmarks/api/scores", {
		  method: "POST",
		  headers: { "Content-Type": "application/json" },
		  body: JSON.stringify({
			gameId: 2,
			nonce,
			board,
			moves,
		  }),
		})

		if (!response.ok) return null

		const data = await response.json()
		const confirmedScore =
		  typeof data.score === "number" ? data.score : null

		setScoreSaved(true)

		const previousBest = topScores.reduce(
		  (max, entry) => Math.max(max, entry.score),
		  0,
		)
		if (confirmedScore !== null && confirmedScore > previousBest) {
		  setRecordEntry({ score: confirmedScore, steps: finalSteps })
		}

		await loadScores()
		return confirmedScore
	  } catch (error) {
		console.error("Error saving score:", error)
		return null
	  }
	},
	[scoreSaved, loadScores, topScores],
  )

  const resetScore = useCallback(() => {
	setScoreSaved(false)
	setRecordEntry(null)
  }, [])

  return { topScores, error, loadScores, saveScore, resetScore, recordEntry }
}
