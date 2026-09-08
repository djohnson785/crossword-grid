import test from "node:test";
import assert from "node:assert/strict";
import { Grid, isSymmetric180 } from "../src/grid";

interface NumberingCase {
  name: string;
  pattern: string[];
  // expected numbers as "row,col" -> number, only for cells that get one
  expected: Record<string, number>;
}

// These are the cases that are easy to get wrong: single-cell grids,
// isolated white cells that look numberable but aren't (a run of length
// one is not an entry), and rows/columns of length one where only one
// direction can ever apply.
const numberingCases: NumberingCase[] = [
  {
    name: "1x1 white cell has no entries, so no number",
    pattern: ["."],
    expected: {},
  },
  {
    name: "1x1 black cell has no number",
    pattern: ["#"],
    expected: {},
  },
  {
    name: "white cell boxed in by black on all sides is never numbered",
    pattern: ["###", "#.#", "###"],
    expected: {},
  },
  {
    name: "all-black grid has no numbers at all",
    pattern: ["###", "###", "###"],
    expected: {},
  },
  {
    name: "single row: one across entry, no down entries possible",
    pattern: ["....."],
    expected: { "0,0": 1 },
  },
  {
    name: "single column: one down entry, no across entries possible",
    pattern: [".", ".", ".", ".", "."],
    expected: { "0,0": 1 },
  },
  {
    name: "open 3x3 grid numbers every cell on the top row and left column",
    pattern: ["...", "...", "..."],
    expected: {
      "0,0": 1,
      "0,1": 2,
      "0,2": 3,
      "1,0": 4,
      "2,0": 5,
    },
  },
  {
    name: "a black square mid-row splits one across entry into two",
    pattern: ["..#.."],
    expected: {
      "0,0": 1,
      "0,3": 2,
    },
  },
  {
    name: "distinguishes a down-only start, an across-only start, and an unnumbered cell",
    pattern: [".#", ".."],
    expected: { "0,0": 1, "1,0": 2 },
  },
];

test("numbering table", async (t) => {
  for (const c of numberingCases) {
    await t.test(c.name, () => {
      const grid = Grid.fromPattern(c.pattern);
      const actual = Object.fromEntries(grid.numbering());
      assert.deepEqual(actual, c.expected);
    });
  }
});

interface SlotCase {
  name: string;
  pattern: string[];
  // [direction, row, col, length][]
  expected: Array<[string, number, number, number]>;
}

const slotCases: SlotCase[] = [
  {
    name: "1x1 grid produces no slots",
    pattern: ["."],
    expected: [],
  },
  {
    name: "single row produces exactly one across slot spanning the row",
    pattern: ["....."],
    expected: [["across", 0, 0, 5]],
  },
  {
    name: "single column produces exactly one down slot spanning the column",
    pattern: [".", ".", "."],
    expected: [["down", 0, 0, 3]],
  },
  {
    name: "black square splits a row into two across slots of differing length",
    pattern: ["..#..."],
    expected: [
      ["across", 0, 0, 2],
      ["across", 0, 3, 3],
    ],
  },
  {
    name: "corner cell contributes both an across and a down slot",
    pattern: ["..", ".."],
    expected: [
      ["across", 0, 0, 2],
      ["down", 0, 0, 2],
      ["down", 0, 1, 2],
      ["across", 1, 0, 2],
    ],
  },
];

test("slots table", async (t) => {
  for (const c of slotCases) {
    await t.test(c.name, () => {
      const grid = Grid.fromPattern(c.pattern);
      const actual = grid.slots().map((s): [string, number, number, number] => [
        s.direction,
        s.row,
        s.col,
        s.length,
      ]);
      assert.deepEqual(actual, c.expected);
    });
  }
});

interface SymmetryCase {
  name: string;
  pattern: string[];
  expected: boolean;
}

const symmetryCases: SymmetryCase[] = [
  {
    name: "all white grid is trivially symmetric",
    pattern: ["...", "...", "..."],
    expected: true,
  },
  {
    name: "single black square at dead center of odd grid is symmetric",
    pattern: ["...", ".#.", "..."],
    expected: true,
  },
  {
    name: "black square off-center with no mirrored partner is not symmetric",
    pattern: ["#..", "...", "..."],
    expected: false,
  },
  {
    name: "non-square rectangle can still be symmetric",
    pattern: ["#...", "...#"],
    expected: true,
  },
  {
    name: "1x1 grid is always symmetric with itself",
    pattern: ["#"],
    expected: true,
  },
];

test("symmetry table", async (t) => {
  for (const c of symmetryCases) {
    await t.test(c.name, () => {
      const grid = Grid.fromPattern(c.pattern);
      assert.equal(isSymmetric180(grid), c.expected);
    });
  }
});

test("constructor rejects an empty pattern", () => {
  assert.throws(() => new Grid([]), /at least one row/);
});

test("constructor rejects rows of length zero", () => {
  assert.throws(() => new Grid([""]), /must not be empty/);
});

test("constructor rejects ragged rows", () => {
  assert.throws(() => new Grid(["...", ".."]), /same length/);
});
