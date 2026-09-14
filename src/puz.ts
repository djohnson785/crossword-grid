/**
 * Reader for the .puz binary format used by Across Lite and most of the
 * newspaper syndicates that predate ipuz. Unlike ipuz, .puz has no
 * self-describing structure: it is a fixed-size header, then two
 * width*height grids, then a run of NUL-terminated strings, all tied
 * together by checksums whose only job is to catch a truncated or
 * hand-edited file.
 *
 * Layout (see the community-maintained format notes at
 * http://www.wutka.com/crossword.html and the puzpy project for the
 * canonical description this follows):
 *
 *   0x00  2 bytes   overall file checksum
 *   0x02  12 bytes  "ACROSS&DOWN\0" magic string
 *   0x0E  2 bytes   CIB (width/height/etc.) checksum
 *   0x10  16 bytes  masked checksums (not verified here, see below)
 *   0x20  4 bytes   version string, e.g. "1.3\0"
 *   0x24  2 bytes   reserved
 *   0x26  2 bytes   scrambled checksum
 *   0x28  12 bytes  reserved
 *   0x34  1 byte    width
 *   0x35  1 byte    height
 *   0x36  2 bytes   number of clues
 *   0x38  2 bytes   puzzle type bitmask
 *   0x3A  2 bytes   scrambled tag (0 if the solution is not scrambled)
 *   0x3C  ...       solution grid, width*height bytes, '.' marks black
 *   ...   ...       player state grid, width*height bytes
 *   ...   ...       title, author, copyright: NUL-terminated strings
 *   ...   ...       clue text: one NUL-terminated string per clue
 *   ...   ...       notes: NUL-terminated string
 *
 * The masked checksums (0x10-0x1F) exist to let a strict reader pin down
 * which section of the file is corrupt. This reader only checks the
 * overall checksum at 0x00, which already tells you whether the file's
 * contents match what it claims to contain.
 */

import { Grid } from "./grid";

export interface PuzClue {
  number: number;
  text: string;
}

export interface PuzPuzzle {
  grid: Grid;
  title: string;
  author: string;
  copyright: string;
  notes: string;
  /** Solution letters in row-major order, '.' for black squares. If
   * `scrambled` is true these are not the real answers. */
  solution: string;
  /** True if the solution letters are scrambled (an Across Lite "lock"
   * feature). Descrambling is not implemented here. */
  scrambled: boolean;
  /** False if the file's checksum does not match its contents. The file
   * may still be readable, but its data should be treated with suspicion. */
  checksumValid: boolean;
  clues: {
    across: PuzClue[];
    down: PuzClue[];
  };
}

const MAGIC = "ACROSS&DOWN\0";
const MAGIC_OFFSET = 0x02;
const CIB_OFFSET = 0x34;
const CIB_LENGTH = 8;
const HEADER_LENGTH = 0x3c;

/**
 * The .puz checksum: a 16-bit rotate-and-add over a byte range. Every
 * checksum in the file, including the CIB and overall checksums, is this
 * same function applied to a different slice with a different seed.
 */
export function puzChecksum(data: Uint8Array, seed = 0): number {
  let checksum = seed;
  for (let i = 0; i < data.length; i++) {
    const carry = checksum & 1;
    checksum >>>= 1;
    if (carry) checksum += 0x8000;
    checksum = (checksum + data[i]) & 0xffff;
  }
  return checksum;
}

function readUint16LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function latin1Decode(data: Uint8Array): string {
  return String.fromCharCode(...data);
}

/** Reads a NUL-terminated string starting at `offset`, returning the text
 * (without the NUL) and the offset of the byte after it. */
function readCString(data: Uint8Array, offset: number): { text: string; next: number } {
  let end = offset;
  while (end < data.length && data[end] !== 0) end++;
  if (end >= data.length) {
    throw new Error("puz file ends in the middle of a string");
  }
  return { text: latin1Decode(data.subarray(offset, end)), next: end + 1 };
}

/**
 * Turns the width*height solution bytes into the rows Grid.fromPattern
 * expects. .puz marks a black square with '.', which is already this
 * library's white-square default, so black and white are inverted here:
 * '.' becomes '#' and everything else becomes '.'.
 */
function patternFromSolution(solution: string, width: number, height: number): string[] {
  const rows: string[] = [];
  for (let r = 0; r < height; r++) {
    const row = solution.slice(r * width, (r + 1) * width);
    rows.push(Array.from(row, (ch) => (ch === "." ? "#" : ".")).join(""));
  }
  return rows;
}

/**
 * Parses a .puz file's bytes into a Grid plus its metadata and clue text.
 * As with parseIpuz, clue text comes back as flat across/down lists rather
 * than merged into Grid.slots(): matching clue numbers to slots is a
 * separate concern from reading the file.
 */
export function parsePuz(source: Uint8Array): PuzPuzzle {
  if (source.length < HEADER_LENGTH) {
    throw new Error("puz file is too short to contain a header");
  }

  const magic = latin1Decode(source.subarray(MAGIC_OFFSET, MAGIC_OFFSET + MAGIC.length));
  if (magic !== MAGIC) {
    throw new Error("not a .puz file: missing ACROSS&DOWN magic string");
  }

  const width = source[CIB_OFFSET];
  const height = source[CIB_OFFSET + 1];
  const numClues = readUint16LE(source, CIB_OFFSET + 2);
  const scrambledTag = readUint16LE(source, CIB_OFFSET + 6);
  const cellCount = width * height;

  const solutionStart = HEADER_LENGTH;
  const stateStart = solutionStart + cellCount;
  const stringsStart = stateStart + cellCount;
  if (source.length < stringsStart) {
    throw new Error("puz file ends before its solution and state grids");
  }

  const solutionBytes = source.subarray(solutionStart, stateStart);
  const stateBytes = source.subarray(stateStart, stringsStart);
  const solution = latin1Decode(solutionBytes);

  let offset = stringsStart;
  const readString = (): string => {
    const { text, next } = readCString(source, offset);
    offset = next;
    return text;
  };

  const title = readString();
  const author = readString();
  const copyright = readString();
  const clueTexts: string[] = [];
  for (let i = 0; i < numClues; i++) clueTexts.push(readString());
  const notes = offset < source.length ? readString() : "";

  const grid = Grid.fromPattern(patternFromSolution(solution, width, height));
  const slots = grid.slots();
  if (slots.length !== clueTexts.length) {
    throw new Error(
      `puz file has ${clueTexts.length} clues but the grid has ${slots.length} slots`
    );
  }
  const across: PuzClue[] = [];
  const down: PuzClue[] = [];
  slots.forEach((slot, i) => {
    const clue: PuzClue = { number: slot.number, text: clueTexts[i] };
    (slot.direction === "across" ? across : down).push(clue);
  });

  const cibChecksum = puzChecksum(source.subarray(CIB_OFFSET, CIB_OFFSET + CIB_LENGTH));
  let expectedChecksum = cibChecksum;
  expectedChecksum = puzChecksum(solutionBytes, expectedChecksum);
  expectedChecksum = puzChecksum(stateBytes, expectedChecksum);
  const encoder = (s: string, withNul: boolean): Uint8Array =>
    Uint8Array.from(withNul ? `${s}\0` : s, (ch) => ch.charCodeAt(0));
  if (title) expectedChecksum = puzChecksum(encoder(title, true), expectedChecksum);
  if (author) expectedChecksum = puzChecksum(encoder(author, true), expectedChecksum);
  if (copyright) expectedChecksum = puzChecksum(encoder(copyright, true), expectedChecksum);
  for (const clue of clueTexts) {
    if (clue) expectedChecksum = puzChecksum(encoder(clue, false), expectedChecksum);
  }
  // Notes only count toward the checksum from format version 1.3 onward,
  // but every file worth reading today is at least that new, so this
  // treats a present, non-empty notes string as always counted.
  if (notes) expectedChecksum = puzChecksum(encoder(notes, true), expectedChecksum);

  const fileChecksum = readUint16LE(source, 0);

  return {
    grid,
    title,
    author,
    copyright,
    notes,
    solution,
    scrambled: scrambledTag !== 0,
    checksumValid: expectedChecksum === fileChecksum,
    clues: { across, down },
  };
}
