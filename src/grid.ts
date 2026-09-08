/**
 * A crossword grid is a rectangle of cells, each either black (blocked) or
 * white (fillable). This module answers the two questions every crossword
 * tool needs answered before it can do anything else: which cells get a
 * clue number, and which runs of white cells form an across or down entry.
 */

export type Direction = "across" | "down";

export interface SlotCell {
  row: number;
  col: number;
}

export interface Slot {
  number: number;
  direction: Direction;
  row: number;
  col: number;
  length: number;
  cells: SlotCell[];
}

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export class Grid {
  readonly rowCount: number;
  readonly colCount: number;
  private readonly black: boolean[][];

  constructor(pattern: string[]) {
    if (pattern.length === 0) {
      throw new Error("grid must have at least one row");
    }
    const width = pattern[0].length;
    if (width === 0) {
      throw new Error("grid rows must not be empty");
    }
    for (const row of pattern) {
      if (row.length !== width) {
        throw new Error("all rows must have the same length");
      }
    }
    this.rowCount = pattern.length;
    this.colCount = width;
    this.black = pattern.map((row) => Array.from(row, (ch) => ch === "#"));
  }

  static fromPattern(pattern: string[]): Grid {
    return new Grid(pattern);
  }

  // Out-of-bounds is treated as black. That makes the numbering rules below
  // read the same at an edge as they do next to an actual black square,
  // instead of needing separate boundary checks everywhere.
  isBlack(row: number, col: number): boolean {
    if (row < 0 || row >= this.rowCount || col < 0 || col >= this.colCount) {
      return true;
    }
    return this.black[row][col];
  }

  private startsAcross(row: number, col: number): boolean {
    if (this.isBlack(row, col)) return false;
    return this.isBlack(row, col - 1) && !this.isBlack(row, col + 1);
  }

  private startsDown(row: number, col: number): boolean {
    if (this.isBlack(row, col)) return false;
    return this.isBlack(row - 1, col) && !this.isBlack(row + 1, col);
  }

  /**
   * Standard crossword numbering: a white cell gets the next number if it
   * begins an across entry, a down entry, or both. A run of a single white
   * cell does not count as an entry, so an isolated white cell never gets
   * a number.
   */
  numbering(): Map<string, number> {
    const numbers = new Map<string, number>();
    let next = 1;
    for (let r = 0; r < this.rowCount; r++) {
      for (let c = 0; c < this.colCount; c++) {
        if (this.startsAcross(r, c) || this.startsDown(r, c)) {
          numbers.set(cellKey(r, c), next++);
        }
      }
    }
    return numbers;
  }

  slots(): Slot[] {
    const numbers = this.numbering();
    const slots: Slot[] = [];
    for (let r = 0; r < this.rowCount; r++) {
      for (let c = 0; c < this.colCount; c++) {
        const number = numbers.get(cellKey(r, c));
        if (number === undefined) continue;

        if (this.startsAcross(r, c)) {
          const cells: SlotCell[] = [];
          for (let cc = c; !this.isBlack(r, cc); cc++) {
            cells.push({ row: r, col: cc });
          }
          slots.push({ number, direction: "across", row: r, col: c, length: cells.length, cells });
        }

        if (this.startsDown(r, c)) {
          const cells: SlotCell[] = [];
          for (let rr = r; !this.isBlack(rr, c); rr++) {
            cells.push({ row: rr, col: c });
          }
          slots.push({ number, direction: "down", row: r, col: c, length: cells.length, cells });
        }
      }
    }
    return slots;
  }
}

/**
 * American-style crosswords conventionally require 180-degree rotational
 * symmetry: rotating the grid a half turn reproduces the same black/white
 * pattern. This checks that property without assuming a square grid.
 */
export function isSymmetric180(grid: Grid): boolean {
  for (let r = 0; r < grid.rowCount; r++) {
    for (let c = 0; c < grid.colCount; c++) {
      const mirroredRow = grid.rowCount - 1 - r;
      const mirroredCol = grid.colCount - 1 - c;
      if (grid.isBlack(r, c) !== grid.isBlack(mirroredRow, mirroredCol)) {
        return false;
      }
    }
  }
  return true;
}
