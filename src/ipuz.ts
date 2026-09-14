/**
 * Reader for the ipuz crossword interchange format (http://ipuz.org).
 * ipuz encodes a puzzle as plain JSON, which keeps this file a JSON.parse
 * plus a mapping from ipuz's cell encoding to the black/white pattern the
 * rest of this library expects. The older .puz binary format has its own
 * reader in ./puz.ts, since it needs bit-level parsing and checksum
 * validation instead of a JSON.parse.
 */

import { Grid } from "./grid";

export interface IpuzClue {
  number: number;
  text: string;
}

export interface IpuzPuzzle {
  grid: Grid;
  title?: string;
  author?: string;
  copyright?: string;
  notes?: string;
  clues: {
    across: IpuzClue[];
    down: IpuzClue[];
  };
}

type RawIpuzCell = string | number | null | { cell?: string | number | null };
type RawIpuzClue = [number, string] | { number: number; clue: string };

interface RawIpuzDocument {
  kind?: string[];
  puzzle?: RawIpuzCell[][];
  block?: string;
  title?: string;
  author?: string;
  copyright?: string;
  notes?: string;
  clues?: {
    Across?: RawIpuzClue[];
    Down?: RawIpuzClue[];
  };
}

function cellValue(cell: RawIpuzCell): string | number | null {
  if (cell !== null && typeof cell === "object") {
    return cell.cell ?? null;
  }
  return cell;
}

/**
 * Turns the ipuz "puzzle" array into the '#'/'.' pattern Grid.fromPattern
 * expects. ipuz allows a custom block character via the top-level "block"
 * field, and uses null for cells outside an irregularly shaped grid; both
 * become black here since this library only models rectangular black/white
 * grids, not the notched or diamond shapes ipuz otherwise permits.
 */
function patternFromIpuz(doc: RawIpuzDocument): string[] {
  const puzzle = doc.puzzle;
  if (!puzzle || puzzle.length === 0) {
    throw new Error("ipuz document has no puzzle grid");
  }
  const blockChar = doc.block ?? "#";
  return puzzle.map((row) =>
    row
      .map((rawCell) => {
        const value = cellValue(rawCell);
        return value === null || value === blockChar ? "#" : ".";
      })
      .join("")
  );
}

function parseClueList(raw: RawIpuzClue[] | undefined): IpuzClue[] {
  if (!raw) return [];
  return raw.map((entry) =>
    Array.isArray(entry) ? { number: entry[0], text: entry[1] } : { number: entry.number, text: entry.clue }
  );
}

/**
 * Parses ipuz source (a JSON string, or an object already parsed from one)
 * into a Grid plus the metadata and clue text ipuz carries alongside it.
 * Clue text comes back as flat lists rather than merged into Grid.slots():
 * matching clue numbers to slots is a separate concern from reading the
 * file.
 */
export function parseIpuz(source: string | unknown): IpuzPuzzle {
  const doc = (typeof source === "string" ? JSON.parse(source) : source) as RawIpuzDocument;
  if (!doc || typeof doc !== "object") {
    throw new Error("ipuz source is not a JSON object");
  }
  if (!doc.kind || !doc.kind.some((k) => k.includes("crossword"))) {
    throw new Error("ipuz document is not a crossword puzzle");
  }

  const grid = Grid.fromPattern(patternFromIpuz(doc));

  return {
    grid,
    title: doc.title,
    author: doc.author,
    copyright: doc.copyright,
    notes: doc.notes,
    clues: {
      across: parseClueList(doc.clues?.Across),
      down: parseClueList(doc.clues?.Down),
    },
  };
}
