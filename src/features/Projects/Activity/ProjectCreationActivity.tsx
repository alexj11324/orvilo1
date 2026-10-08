import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

import type { ProjectDetail } from '@/store/project';

import { ProjectIcon } from '../ProjectIcon';

/**
 * Compact inline row matching the activity feed's measured reference spec:
 * 16px glyph without a circular backing, 12px/450 text, 12px icon-text gap.
 */
const styles = createStaticStyles(({ css }) => ({
  event: css`
    font-size: 12px;
    font-weight: 450;
    line-height: 17px;
    color: ${cssVar.colorTextSecondary};
  `,
  glyph: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 16px;
    height: 17px;

    color: ${cssVar.colorTextTertiary};
  `,
  row: css`
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding-block: 3px;
  `,
}));

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
        <time dateTime={date.toISOString()} title={date.format('YYYY-MM-DD HH:mm')}>
          {date.format('MMM D')}
        </time>
      </span>
    </div>
  );
}
