import { readFileSync } from 'node:fs';
import path from 'node:path';

import { RAIL_VALUE_FONT_SIZE } from './railText';

const readSource = (file: string) => readFileSync(path.join(__dirname, file), 'utf8');

/**
 * Rail values stay at 13px. The issue title follows Plane: 20px medium, drawn
 * on the control itself (the old rule only matched `.ant-input`, so the
 * textarea kept its field chrome). Description stays 15px/450.
 */
describe('issue rail type scale', () => {
  it('pins the shared rail value size to the measured step', () => {
    expect(RAIL_VALUE_FONT_SIZE).toBe(13);
  });

  it('sizes property rows at Plane’s 13px regular step', () => {
    const source = readSource('taskDetailLayoutStyles.ts');
    expect(source).toContain('font-size: 13px');
    expect(source).toContain('font-weight: 400');
    expect(source).toContain('width: 120px');
  });

  it.each([
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

  it('keeps the issue title at Plane’s 20px medium step', () => {
    const source = readSource('../shared/style.ts');
    const block = source.slice(source.indexOf('titleInput:'), source.indexOf('breadcrumb:'));
    expect(block).toContain('font-size: 20px');
    expect(block).toContain('font-weight: 500');
    expect(block).not.toContain('&.ant-input');
    expect(block).not.toContain('font-size: 24px');
    expect(block).not.toContain('font-size: 26px');
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
