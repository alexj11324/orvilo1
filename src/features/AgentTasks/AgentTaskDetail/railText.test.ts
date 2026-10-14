import { readFileSync } from 'node:fs';
import path from 'node:path';

import { styles as taskStyles } from '../shared/style';
import { RAIL_VALUE_FONT_SIZE } from './railText';
import { taskDetailLayoutStyles } from './taskDetailLayoutStyles';

const readSource = (file: string) => readFileSync(path.join(__dirname, file), 'utf8');

/**
 * Rail values keep DESIGN.md's scoped 13px role. The issue title consumes the
 * 24px/600 heading step on the control itself (Linear's issue-title role, one
 * step inside the 38/30/24/20/16 scale), including the responsive override.
 * Description keeps the scoped 15px/450 reading role, and the top-level
 * Activity band carries the 15px/600 heading tier.
 */
describe('issue rail type scale', () => {
  it('pins the shared rail value size to the measured step', () => {
    expect(RAIL_VALUE_FONT_SIZE).toBe(13);
  });

  it('sizes property rows with the scoped dense role and regular weight', () => {
    const classes = taskDetailLayoutStyles.propertyValue.split(' ');
    expect(classes).toEqual(
      expect.arrayContaining(['text-(length:--text-dense)', 'leading-5', 'font-normal']),
    );
  });

  it.each([
    'TaskAcceptanceStateRow.tsx',
    'TaskProjectSection.tsx',
    'TaskParentBar.tsx',
    'TaskRelatedSection.tsx',
  ])('%s sizes every rail Text explicitly — never the 14px default', (file) => {
    const source = readSource(file);
    expect(source).toContain('RAIL_VALUE_FONT_SIZE');
    const texts = source.match(/<Text\b[^>]*>/g) ?? [];
    const unstyled = texts.filter((tag) => !tag.includes('fontSize'));
    expect(unstyled).toEqual([]);
  });

  it('keeps the issue title at the 24px/600 heading step, input and text alike', () => {
    for (const key of ['titleInput', 'titleText'] as const) {
      const classes = taskStyles[key].split(' ');
      expect(classes).toEqual(expect.arrayContaining(['text-2xl', 'leading-8', 'font-semibold']));
      expect(classes).not.toContain('text-xl');
      expect(taskStyles[key]).not.toMatch(/text-\[\d+px\]/);
    }
    // The editable control keeps the responsive pin that guards the 24px step.
    expect(taskStyles.titleInput.split(' ')).toContain('md:text-2xl');
    expect(taskStyles.titleInput).not.toContain('.ant-input');
  });

  it('keeps the rail group labels on the compact secondary-ink tier', () => {
    // Linear's rail section labels (Properties / Labels / Project) read in the
    // same muted 12px/500 as the collapsible section headers — never body ink.
    const classes = taskDetailLayoutStyles.railSectionLabel.split(' ');
    expect(classes).toEqual(
      expect.arrayContaining(['text-xs', 'font-medium', 'text-muted-foreground']),
    );
  });

  it('keeps the top-level Activity band on the 15px/600 heading tier', () => {
    const classes = taskDetailLayoutStyles.sectionHeading.split(' ');
    expect(classes).toEqual(expect.arrayContaining(['text-[15px]', 'leading-5', 'font-semibold']));
    // Only the Activity section opts in; the compact sections keep 12px/500
    // (Linear's measured Sub-issues collapse label).
    expect(readSource('TaskActivities.tsx')).toContain('variant="heading"');
    const header = readSource('TaskDetailSectionHeader.tsx');
    expect(header).toContain('taskDetailLayoutStyles.sectionHeading');
    expect(header).toContain('text-xs font-medium');
  });

  it('keeps the description at 15px/450 rather than the editor default', () => {
    const source = readSource('TaskInstruction.tsx');
    expect(source).toMatch(/['"]?fontSize['"]?: 15/);
    expect(source).toMatch(/['"]?fontWeight['"]?: 450/);
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
    expect(source).toMatch(/milestoneDate && \([\s\S]*?className="flex-none/);
  });
});
