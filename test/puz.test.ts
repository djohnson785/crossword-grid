import test from "node:test";
import assert from "node:assert/strict";
import { parsePuz, puzChecksum } from "../src/puz";

interface SampleOptions {
  scrambledTag?: number;
}

const WIDTH = 3;
const HEIGHT = 3;
// Same grid shape as the ipuz test fixture: black squares at (0,2) and
// (2,0), giving across clues 1, 3, 5 and down clues 1, 2, 4.
const SOLUTION = "AB." + "CDE" + ".FG";
const STATE = "--." + "---" + ".--";
const TITLE = "Sample";
const AUTHOR = "Author";
// Clue text in the order .puz stores it: by increasing number, across
// before down when a cell starts both.
const CLUES = ["First across", "First down", "Second down", "Second across", "Third down", "Third across"];

function bytesOf(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

function cString(text: string): number[] {
  return [...bytesOf(text), 0];
}

function le16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff];
}

/** Builds a minimal but structurally valid .puz file with a correct
 * overall checksum, so tests can exercise the parser without a real
 * Across Lite file on disk. */
function buildPuzBuffer(opts: SampleOptions = {}): Uint8Array {
  const scrambledTag = opts.scrambledTag ?? 0;
  const cib = [WIDTH, HEIGHT, ...le16(CLUES.length), ...le16(1), ...le16(scrambledTag)];
  const solutionBytes = bytesOf(SOLUTION);
  const stateBytes = bytesOf(STATE);

  let checksum = puzChecksum(Uint8Array.from(cib));
  checksum = puzChecksum(Uint8Array.from(solutionBytes), checksum);
  checksum = puzChecksum(Uint8Array.from(stateBytes), checksum);
  checksum = puzChecksum(Uint8Array.from(cString(TITLE)), checksum);
  checksum = puzChecksum(Uint8Array.from(cString(AUTHOR)), checksum);
  for (const clue of CLUES) {
    checksum = puzChecksum(Uint8Array.from(bytesOf(clue)), checksum);
  }

  const header = new Array<number>(0x3c).fill(0);
  header.splice(0, 2, ...le16(checksum));
  header.splice(0x02, cString("ACROSS&DOWN").length, ...cString("ACROSS&DOWN"));
  header.splice(0x0e, 2, ...le16(puzChecksum(Uint8Array.from(cib))));
  header.splice(0x20, 4, ...cString("1.3"));
  header.splice(0x34, 1, WIDTH);
  header.splice(0x35, 1, HEIGHT);
  header.splice(0x36, 2, ...le16(CLUES.length));
  header.splice(0x38, 2, ...le16(1));
  header.splice(0x3a, 2, ...le16(scrambledTag));

  const strings = [
    ...cString(TITLE),
    ...cString(AUTHOR),
    ...cString(""), // copyright
    ...CLUES.flatMap(cString),
    ...cString(""), // notes
  ];

  return Uint8Array.from([...header, ...solutionBytes, ...stateBytes, ...strings]);
}

test("parsePuz reads the grid, title, author, and clue text", () => {
  const puzzle = parsePuz(buildPuzBuffer());
  assert.equal(puzzle.grid.rowCount, 3);
  assert.equal(puzzle.grid.colCount, 3);
  assert.equal(puzzle.grid.isBlack(0, 2), true);
  assert.equal(puzzle.grid.isBlack(2, 0), true);
  assert.equal(puzzle.grid.isBlack(0, 0), false);
  assert.equal(puzzle.title, "Sample");
  assert.equal(puzzle.author, "Author");
  assert.equal(puzzle.solution, SOLUTION);
});

test("parsePuz assigns clue text to the matching numbered slot", () => {
  const puzzle = parsePuz(buildPuzBuffer());
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

test("parsePuz reports a valid checksum for an untouched file", () => {
  const puzzle = parsePuz(buildPuzBuffer());
  assert.equal(puzzle.checksumValid, true);
});

test("parsePuz reports an invalid checksum when the file has been altered", () => {
  const buffer = buildPuzBuffer();
  // Flip a solution letter without updating the checksum, simulating a
  // hand-edited or corrupted file. The cell stays white either way, so
  // this only exercises the checksum, not the grid shape.
  const solutionStart = 0x3c;
  buffer[solutionStart] = "Z".charCodeAt(0);
  const puzzle = parsePuz(buffer);
  assert.equal(puzzle.checksumValid, false);
});

test("parsePuz reports whether the solution is scrambled", () => {
  assert.equal(parsePuz(buildPuzBuffer()).scrambled, false);
  assert.equal(parsePuz(buildPuzBuffer({ scrambledTag: 1234 })).scrambled, true);
});

test("parsePuz rejects a buffer without the ACROSS&DOWN magic string", () => {
  const buffer = buildPuzBuffer();
  buffer[0x02] = "X".charCodeAt(0);
  assert.throws(() => parsePuz(buffer), /ACROSS&DOWN/);
});

test("parsePuz rejects a buffer shorter than the header", () => {
  assert.throws(() => parsePuz(new Uint8Array(10)), /too short/);
});
