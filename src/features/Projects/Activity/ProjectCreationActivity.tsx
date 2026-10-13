import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

import { formatProjectDay } from '@/features/Projects/projectPlanningDate';
import type { ProjectDetail } from '@/store/project';

import { ProjectIcon } from '../ProjectIcon';

/**
 * Creation audit metadata uses the DESIGN 12px/20px line box and normal weight,
 * with a 16px glyph, no circular backing, and a 12px icon-text gap.
 */
const styles = {
  event: 'text-xs font-normal text-muted-foreground',
  glyph: 'flex h-5 w-4 flex-none items-center justify-center text-foreground-tertiary',
  row: 'flex items-start gap-3 py-0.5',
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
