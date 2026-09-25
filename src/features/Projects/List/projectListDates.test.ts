import { readFileSync } from 'node:fs';
import path from 'node:path';

const readSource = (file: string) => readFileSync(path.join(__dirname, file), 'utf8');

/**
 * Linear shows the same date everywhere: this year drops the year, other
 * years keep it, and zh-CN renders "M月D日" — never a hardcoded 'MMM D'.
 * The projects list's chip, board card, timeline range and date cell each
 * printed `MMM D` regardless of locale; they now format through
 * `useProjectDateFormatter` and this gate keeps the hardcoded shape out.
 */
describe('project list dates run through the locale formatter', () => {
  it.each(['index.tsx', 'MilestoneChip.tsx', 'ProjectBoard.tsx', 'ProjectTimeline.tsx'])(
    '%s formats visible dates via useProjectDateFormatter',
    (file) => {
      expect(readSource(file)).toContain('useProjectDateFormatter');
    },
  );

  it.each(['index.tsx', 'MilestoneChip.tsx', 'ProjectBoard.tsx'])(
    '%s has no hardcoded MMM D left',
    (file) => {
      expect(readSource(file)).not.toMatch(/\.format\('MMM D/);
    },
  );

  it('formats the timeline range endpoints through the formatter', () => {
    const source = readSource('ProjectTimeline.tsx');
    expect(source).toContain('formatDate(project.startDate)');
    expect(source).toContain('formatDate(project.targetDate)');
    expect(source).not.toContain('dayjs(project.startDate).format');
    expect(source).not.toContain('dayjs(project.targetDate).format');
  });
});
