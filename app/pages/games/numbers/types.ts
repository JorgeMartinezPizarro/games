export interface CellValues {
    values: {
      n: number;
      b: boolean;
      i: number;
    }
}
export interface CellProps extends CellValues {
    handleClick: (x: CellValues) => void;
}