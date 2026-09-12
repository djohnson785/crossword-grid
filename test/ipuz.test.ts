import test from "node:test";
import assert from "node:assert/strict";
import { parseIpuz } from "../src/ipuz";

function sampleDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: "http://ipuz.org/v2",
    kind: ["http://ipuz.org/crossword#1"],
    dimensions: { width: 3, height: 3 },
    puzzle: [
      [1, 2, "#"],
      [3, 0, 4],
      ["#", 5, 0],
    ],
    clues: {
      Across: [
        [1, "First across"],
        [3, "Second across"],
        [5, "Third across"],
      ],
      Down: [
        [1, "First down"],
        [2, "Second down"],
        [4, "Third down"],
      ],
    },
    title: "Sample",
    author: "Author",
    ...overrides,
  };
}

test("parseIpuz turns the puzzle array into a matching black/white grid", () => {
  const puzzle = parseIpuz(sampleDocument());
  assert.equal(puzzle.grid.rowCount, 3);
  assert.equal(puzzle.grid.colCount, 3);
  assert.equal(puzzle.grid.isBlack(0, 2), true);
  assert.equal(puzzle.grid.isBlack(2, 0), true);
  assert.equal(puzzle.grid.isBlack(0, 0), false);
  assert.equal(puzzle.grid.isBlack(1, 1), false);
});

test("parseIpuz accepts a JSON string as well as a parsed object", () => {
  const puzzle = parseIpuz(JSON.stringify(sampleDocument()));
  assert.equal(puzzle.grid.rowCount, 3);
});

test("parseIpuz reads title, author, and clue text", () => {
  const puzzle = parseIpuz(sampleDocument());
  assert.equal(puzzle.title, "Sample");
  assert.equal(puzzle.author, "Author");
  assert.deepEqual(puzzle.clues.across, [
    { number: 1, text: "First across" },
    { number: 3, text: "Second across" },
    { number: 5, text: "Third across" },
  ]);
  assert.deepEqual(puzzle.clues.down, [
    { number: 1, text: "First down" },
    { number: 2, text: "Second down" },
    { number: 4, text: "Third down" },
  ]);
});

test("parseIpuz honors a custom block character", () => {
  const doc = sampleDocument({
    block: "X",
    puzzle: [
      [1, 2, "X"],
      [3, 0, 4],
      ["X", 5, 0],
    ],
  });
  const puzzle = parseIpuz(doc);
  assert.equal(puzzle.grid.isBlack(0, 2), true);
  assert.equal(puzzle.grid.isBlack(2, 0), true);
});

test("parseIpuz treats null cells (irregular shapes) as black", () => {
  const doc = sampleDocument({
    puzzle: [
      [1, 2, null],
      [3, 0, 4],
      [null, 5, 0],
    ],
  });
  const puzzle = parseIpuz(doc);
  assert.equal(puzzle.grid.isBlack(0, 2), true);
  assert.equal(puzzle.grid.isBlack(2, 0), true);
});

test("parseIpuz rejects documents that are not crosswords", () => {
  const doc = sampleDocument({ kind: ["http://ipuz.org/sudoku#1"] });
  assert.throws(() => parseIpuz(doc), /not a crossword/);
});

test("parseIpuz rejects a document with no puzzle grid", () => {
  const doc = sampleDocument({ puzzle: undefined });
  assert.throws(() => parseIpuz(doc), /no puzzle grid/);
});

test("parseIpuz rejects non-object source", () => {
  assert.throws(() => parseIpuz(null), /not a JSON object/);
});
