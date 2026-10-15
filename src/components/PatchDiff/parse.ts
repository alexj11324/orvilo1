import { diffWordsWithSpace, parsePatch } from 'diff';

export type PatchDiffSide = 'additions' | 'deletions';

export interface PatchDiffSegment {
  changed: boolean;
  text: string;
}

export interface PatchDiffLine {
  kind: 'addition' | 'context' | 'deletion';
  newNumber?: number;
  oldNumber?: number;
  /** Word-level spans for a paired deletion/addition; absent for plain lines. */
  segments?: PatchDiffSegment[];
  text: string;
}

export interface PatchDiffHunk {
  header: string;
  lines: PatchDiffLine[];
}

export interface PatchDiffSplitRow {
  left?: PatchDiffLine;
  right?: PatchDiffLine;
}

const pairWords = (deletion: PatchDiffLine, addition: PatchDiffLine) => {
  const changes = diffWordsWithSpace(deletion.text, addition.text);
  deletion.segments = changes
    .filter((change) => !change.added)
    .map((change) => ({ changed: !!change.removed, text: change.value }));
  addition.segments = changes
    .filter((change) => !change.removed)
    .map((change) => ({ changed: !!change.added, text: change.value }));
};

/** Visits each run of deletions followed by additions within a hunk. */
const forEachChangeRun = (
  lines: PatchDiffLine[],
  visitor: (deletions: PatchDiffLine[], additions: PatchDiffLine[]) => void,
) => {
  let index = 0;
  while (index < lines.length) {
    if (lines[index].kind === 'context') {
      index += 1;
      continue;
    }
    const deletions: PatchDiffLine[] = [];
    const additions: PatchDiffLine[] = [];
    while (lines[index]?.kind === 'deletion') deletions.push(lines[index++]);
    while (lines[index]?.kind === 'addition') additions.push(lines[index++]);
    visitor(deletions, additions);
  }
};

/** Parses a unified patch (with or without file headers) into hunks of numbered lines. */
export const parsePatchHunks = (patch: string, wordDiff = false): PatchDiffHunk[] => {
  const hunks: PatchDiffHunk[] = [];

  for (const file of parsePatch(patch)) {
    for (const hunk of file.hunks) {
      let oldNumber = hunk.oldStart;
      let newNumber = hunk.newStart;
      const lines: PatchDiffLine[] = [];

      for (const raw of hunk.lines) {
        const marker = raw[0];
        const text = raw.slice(1);
        if (marker === '+') lines.push({ kind: 'addition', newNumber: newNumber++, text });
        else if (marker === '-') lines.push({ kind: 'deletion', oldNumber: oldNumber++, text });
        else if (marker === ' ')
          lines.push({ kind: 'context', newNumber: newNumber++, oldNumber: oldNumber++, text });
      }

      if (wordDiff) {
        forEachChangeRun(lines, (deletions, additions) => {
          const pairs = Math.min(deletions.length, additions.length);
          for (let i = 0; i < pairs; i++) pairWords(deletions[i], additions[i]);
        });
      }

      hunks.push({
        header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
        lines,
      });
    }
  }

  return hunks;
};

/** Side-by-side rows: context on both sides, change runs paired line by line. */
export const toSplitRows = (lines: PatchDiffLine[]): PatchDiffSplitRow[] => {
  const rows: PatchDiffSplitRow[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.kind === 'context') {
      rows.push({ left: line, right: line });
      index += 1;
      continue;
    }
    const deletions: PatchDiffLine[] = [];
    const additions: PatchDiffLine[] = [];
    while (lines[index]?.kind === 'deletion') deletions.push(lines[index++]);
    while (lines[index]?.kind === 'addition') additions.push(lines[index++]);
    for (let i = 0; i < Math.max(deletions.length, additions.length); i++) {
      rows.push({ left: deletions[i], right: additions[i] });
    }
  }
  return rows;
};

/** The side and line number a diff line is addressed by. */
export const lineAddress = (
  line: PatchDiffLine,
  side?: PatchDiffSide,
): { line: number; side: PatchDiffSide } => {
  if (line.kind === 'deletion' || (side === 'deletions' && line.oldNumber !== undefined))
    return { line: line.oldNumber!, side: 'deletions' };
  return { line: line.newNumber!, side: 'additions' };
};

export interface PatchDiffLineRange {
  end: number;
  endSide?: PatchDiffSide;
  side?: PatchDiffSide;
  start: number;
}

export interface PatchDiffSelection {
  anchor: number;
  end: number;
  side: PatchDiffSide;
  start: number;
}

export const isLineSelected = (
  selection: PatchDiffSelection | null,
  line: PatchDiffLine | undefined,
  side?: PatchDiffSide,
): boolean => {
  if (!line || !selection) return false;
  const address = lineAddress(line, side);
  return (
    address.side === selection.side &&
    address.line >= selection.start &&
    address.line <= selection.end
  );
};

/** Click selects one line; an extending click on the same side spans from the anchor. */
export const nextSelection = (
  current: PatchDiffSelection | null,
  line: PatchDiffLine,
  side: PatchDiffSide | undefined,
  extend: boolean,
): PatchDiffSelection => {
  const address = lineAddress(line, side);
  if (extend && current && current.side === address.side) {
    return {
      ...current,
      end: Math.max(current.anchor, address.line),
      start: Math.min(current.anchor, address.line),
    };
  }
  return { anchor: address.line, end: address.line, side: address.side, start: address.line };
};

/** The range a gutter action reports: the selection when it contains the line, else that line. */
export const gutterRange = (
  selection: PatchDiffSelection | null,
  line: PatchDiffLine,
  side?: PatchDiffSide,
): PatchDiffLineRange => {
  if (selection && isLineSelected(selection, line, side)) {
    const { end, side: selectedSide, start } = selection;
    return { end, endSide: selectedSide, side: selectedSide, start };
  }
  const address = lineAddress(line, side);
  return { end: address.line, endSide: address.side, side: address.side, start: address.line };
};
