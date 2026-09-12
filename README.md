# crossword-grid

A small TypeScript library for working with the black-and-white grid
underneath a crossword puzzle: given the pattern of blocked and open
squares, figure out where the clue numbers go and which runs of squares
form across and down entries.

This is a library, not an app. It has no UI and no dependencies. It exists
to be the part of a crossword tool that everyone ends up writing by hand
and getting slightly wrong at the edges.

## The problem

Numbering a crossword grid sounds trivial until you write it: scan the
grid, number 1, 2, 3... left to right, top to bottom. The part that trips
people up is deciding *which* cells get a number. The rule is:

A white square gets a number if it is the first square of an across entry,
a down entry, or both — where "entry" means a run of two or more
consecutive white squares. A lone white square with black (or the grid
edge) on every side is not an entry in either direction and gets no
number, even though it looks like it should.

Getting that boundary condition right, along with square and non-square
grids, single rows, and fully blocked grids, is what this library's test
suite is built around.

## Usage

```ts
import { Grid, isSymmetric180 } from "crossword-grid";

// '#' marks a black square; any other character marks a white square.
const grid = Grid.fromPattern([
  "...#.",
  ".#...",
  "...#.",
  ".#...",
  ".....",
]);

const numbers = grid.numbering(); // Map<"row,col", number>
console.log(numbers.get("0,0")); // 1

for (const slot of grid.slots()) {
  console.log(`${slot.number}${slot.direction[0]}`, slot.length);
  // e.g. "1a 3", "1d 3", "4a 2", ...
}

// American-style grids are conventionally symmetric under a 180 degree
// rotation. Useful as a sanity check before publishing a grid.
console.log(isSymmetric180(grid));
```

`Grid.slots()` returns one entry per across or down run, including the
cells it covers:

```ts
interface Slot {
  number: number;
  direction: "across" | "down";
  row: number;
  col: number;
  length: number;
  cells: Array<{ row: number; col: number }>;
}
```

## Reading ipuz files

[ipuz](http://www.ipuz.org/) is a JSON-based crossword interchange format.
`parseIpuz` reads one into a `Grid` plus whatever title, author, and clue
text the file carries:

```ts
import { readFileSync } from "node:fs";
import { parseIpuz } from "crossword-grid";

const puzzle = parseIpuz(readFileSync("puzzle.ipuz", "utf8"));
puzzle.grid.slots(); // same Grid API as above
puzzle.clues.across; // [{ number: 1, text: "..." }, ...]
puzzle.clues.down;
```

`parseIpuz` also takes an already-parsed object, so a puzzle fetched as
JSON doesn't need to be stringified first. Clue text is returned as flat
lists rather than merged into `Grid.slots()`, since matching clue numbers
to slots is a separate step. The older binary `.puz` format isn't
supported yet.

## Building and testing

```
npm run build
npm test
```

The test suite is table-driven (`test/grid.test.ts`), using Node's built-in
test runner. Each table entry is a small grid pattern paired with the
expected numbers, slots, or symmetry result, so new edge cases can be added
as one line rather than a new test function.

## Status

Early. Numbering, slot extraction, 180-degree symmetry checking, and
reading ipuz files work. Not yet covered: the .puz format, associating
clue text with individual slots, and fill validation.
