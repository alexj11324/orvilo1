import { useTranslation } from 'react-i18next';

import type { ProjectDetail } from '@/store/project';

import { projectIssueProgress } from '../projectIssueProgress';

const styles = {
  metric: 'm-0 flex-1 text-[12px] leading-5',
  marker: 'size-1.5 rounded-[1px]',
};

const colors = {
  scope: 'var(--ant-color-text-tertiary)',
  started: 'var(--warning)',
  completed: 'var(--primary)',
};

export function ProjectIssueProgress({ issues }: { issues: ProjectDetail['tasks'] }) {
  const { t } = useTranslation('project');
  const progress = projectIssueProgress(issues);
  if (!progress) return <span role="status">{t('overview.progressUnavailable')}</span>;
  return (
    <div className="flex flex-row" style={{ gap: 8 }}>
      {(['scope', 'started', 'completed'] as const).map((key) => (
        <dl className={styles.metric} key={key}>
          <dt className="flex items-center gap-[5px] text-muted-foreground">
            <span aria-hidden className={styles.marker} style={{ background: colors[key] }} />
            {t(`overview.progress.${key}`)}
          </dt>
          <dd className="m-0 ps-[11px] text-foreground">{progress[key]}</dd>
        </dl>
      ))}
    </div>
  );
}
