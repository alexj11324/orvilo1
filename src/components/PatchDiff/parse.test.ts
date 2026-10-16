import { describe, expect, it } from 'vitest';

import { gutterRange, nextSelection, parsePatchHunks, toSplitRows } from './parse';

const patch = `@@ -1,3 +1,3 @@
 keep
-const value = 1;
+const value = 2;
 tail`;

describe('parsePatchHunks', () => {
  it('numbers old and new lines and pairs word changes', () => {
    const [hunk] = parsePatchHunks(patch, true);

    expect(hunk.header).toBe('@@ -1,3 +1,3 @@');
    expect(hunk.lines.map((line) => [line.kind, line.oldNumber, line.newNumber])).toEqual([
      ['context', 1, 1],
      ['deletion', 2, undefined],
      ['addition', undefined, 2],
      ['context', 3, 3],
    ]);
    expect(hunk.lines[1].segments?.filter((s) => s.changed).map((s) => s.text)).toEqual(['1']);
    expect(hunk.lines[2].segments?.filter((s) => s.changed).map((s) => s.text)).toEqual(['2']);
  });

  it('skips word segments when word diff is off', () => {
    const [hunk] = parsePatchHunks(patch);

    expect(hunk.lines.every((line) => !line.segments)).toBe(true);
  });

  it('parses patches that carry file headers', () => {
    const hunks = parsePatchHunks(`--- a/a.ts\n+++ b/a.ts\n${patch}`);

    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines).toHaveLength(4);
  });
});

describe('toSplitRows', () => {
  it('keeps context on both sides and pairs change runs', () => {
    const [hunk] = parsePatchHunks(patch);
    const rows = toSplitRows(hunk.lines);

    expect(rows).toHaveLength(3);
    expect(rows[0].left).toBe(rows[0].right);
    expect(rows[1].left?.kind).toBe('deletion');
    expect(rows[1].right?.kind).toBe('addition');
  });
});

describe('gutter ranges', () => {
  const [{ lines }] = parsePatchHunks(patch);
  const [context, deletion, addition] = lines;

  it('reports a single line when nothing is selected', () => {
    expect(gutterRange(null, deletion)).toEqual({
      end: 2,
      endSide: 'deletions',
      side: 'deletions',
      start: 2,
    });
    expect(gutterRange(null, context)).toEqual({
      end: 1,
      endSide: 'additions',
      side: 'additions',
      start: 1,
    });
  });

  it('reports an extended selection that contains the line', () => {
    const selection = nextSelection(
      nextSelection(null, context, undefined, false),
      addition,
      undefined,
      true,
    );

    expect(gutterRange(selection, context)).toEqual({
      end: 2,
      endSide: 'additions',
      side: 'additions',
      start: 1,
    });
    // A line on the other side falls back to itself.
    expect(gutterRange(selection, deletion).side).toBe('deletions');
  });

  it('restarts the selection on a plain click', () => {
    const selection = nextSelection(
      nextSelection(null, context, undefined, false),
      addition,
      undefined,
      false,
    );

    expect(selection).toMatchObject({ end: 2, start: 2 });
  });
});
