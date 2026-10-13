import { readFileSync } from 'node:fs';
import path from 'node:path';

import { styles as taskStyles } from '../shared/style';
import { RAIL_VALUE_FONT_SIZE } from './railText';
import { taskDetailLayoutStyles } from './taskDetailLayoutStyles';

const readSource = (file: string) => readFileSync(path.join(__dirname, file), 'utf8');

/**
 * Rail values keep DESIGN.md's scoped 13px role. The issue title consumes the
 * 20px/600 heading role on the control itself, including the responsive override.
 * Description keeps the scoped 15px/450 reading role.
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

  it.each(['TaskProjectSection.tsx', 'TaskParentBar.tsx', 'TaskPrerequisites.tsx'])(
    '%s sizes every rail Text explicitly — never the 14px default',
    (file) => {
      const source = readSource(file);
      expect(source).toContain('RAIL_VALUE_FONT_SIZE');
      const texts = source.match(/<Text\b[^>]*>/g) ?? [];
      const unstyled = texts.filter((tag) => !tag.includes('fontSize'));
      expect(unstyled).toEqual([]);
    },
  );

  it('keeps the issue title at the DESIGN.md 20px strong heading role', () => {
    const classes = taskStyles.titleInput.split(' ');
    expect(classes).toEqual(
      expect.arrayContaining(['text-xl', 'md:text-xl', 'leading-7', 'font-semibold']),
    );
    expect(classes).not.toContain('text-2xl');
    expect(classes).not.toContain('md:text-2xl');
    expect(taskStyles.titleInput).not.toMatch(/text-\[\d+px\]/);
    expect(taskStyles.titleInput).not.toContain('.ant-input');
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
