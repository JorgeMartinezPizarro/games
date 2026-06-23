import { CellValues } from "./types"

export const randomArrayCellValues = (length: number): CellValues[] => Array.from({ length }, (_, i: number) => {
    return {
      values: {
        n: Math.floor(Math.random() * 5) + 2,
        b: false,
        i,
      }
    }
})