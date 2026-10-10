import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

import { formatProjectDay } from '@/features/Projects/projectPlanningDate';
import type { ProjectDetail } from '@/store/project';

import { ProjectIcon } from '../ProjectIcon';

/**
 * Compact inline row matching the activity feed's measured reference spec:
 * 16px glyph without a circular backing, 12px/450 text, 12px icon-text gap.
 */
const styles = {
  event: 'text-[12px] font-[450] leading-[17px] text-muted-foreground',
  glyph:
    'flex h-[17px] w-4 flex-none items-center justify-center text-[var(--ant-color-text-tertiary)]',
  row: 'flex items-start gap-3 py-[3px]',
};

/** Creation is an immutable audit fact, not the project's current owner or current viewer. */
export function ProjectCreationActivity({ project }: { project: ProjectDetail['project'] }) {
  const { t } = useTranslation('project');
  const date = dayjs(project.createdAt);
  if (!project.createdAt || !date.isValid()) return null;
  const creator = project.createdBySnapshot?.displayName;
  return (
    <div className={styles.row}>
      <span className={styles.glyph}>
        <ProjectIcon size={16} />
      </span>
      <span className={styles.event}>
        {creator ? t('activity.createdBy', { name: creator }) : t('activity.created')}
        {' · '}
        <time dateTime={date.toISOString()} title={formatAbsoluteDateTime(date)}>
          {formatProjectDay(date)}
        </time>
      </span>
    </div>
  );
}
