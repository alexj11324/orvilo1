import { readFileSync } from 'node:fs';
import path from 'node:path';

import { RAIL_VALUE_FONT_SIZE } from './railText';

const readSource = (file: string) => readFileSync(path.join(__dirname, file), 'utf8');

/**
 * Measured against Linear's issue page: every rail row value is 13px at
 * medium weight, the body description 15px/450, and the title 24px/600. Each
 * of these had drifted (14px rail values, a 26px title, the editor's 16/400
 * body) — this gate keeps the scale in lockstep and fails if a rail `<Text>`
 * ever drops back to the lobehub default of 14.
 */
describe('issue rail type scale', () => {
  it('pins the shared rail value size to the measured step', () => {
    expect(RAIL_VALUE_FONT_SIZE).toBe(13);
  });

  it.each([
    'TaskProperties.tsx',
    'TaskWorkflowStatusRow.tsx',
    'TaskAcceptanceStateRow.tsx',
    'TaskProjectSection.tsx',
    'TaskParentBar.tsx',
    'TaskPrerequisites.tsx',
  ])('%s sizes every rail Text explicitly — never the 14px default', (file) => {
    const source = readSource(file);
    expect(source).toContain('RAIL_VALUE_FONT_SIZE');
    const texts = source.match(/<Text\b[^>]*>/g) ?? [];
    const unstyled = texts.filter((tag) => !tag.includes('fontSize'));
    expect(unstyled).toEqual([]);
  });

  it('keeps the issue title at the 24px step', () => {
    const source = readSource('../shared/style.ts');
    expect(source).toContain('font-size: 24px');
    expect(source).not.toContain('font-size: 26px');
  });

  it('keeps the description at 15px/450 rather than the editor default', () => {
    const source = readSource('TaskInstruction.tsx');
    expect(source).toContain('fontSize: 15');
    expect(source).toContain('fontWeight: 450');
  });
});

/**
 * The rail's milestone row used to print the raw ISO string (` · 2026-10-15`)
 * and the `name · date` label ran under `white-space: nowrap`, so a long name
 * clipped the date off the row. The row now formats through the same helper
 * the issue list uses and keeps the date on its own non-shrinking span.
 */
describe('issue rail milestone date', () => {
  const source = readSource('TaskProjectSection.tsx');

  it('formats milestone dates through formatTaskItemDate, never raw', () => {
    expect(source).toContain('formatTaskItemDate');
    expect(source).not.toMatch(/\$\{(?:row|milestone)\.date\}/);
  });

  it('keeps the milestone date on a non-shrinking span', () => {
    expect(source).toContain('milestoneDate');
    expect(source).toMatch(/milestoneDate[\s\S]*?flex: 'none'/);
  });
});
