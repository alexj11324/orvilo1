import { Flexbox } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { useTranslation } from 'react-i18next';

import type { ProjectDetail } from '@/store/project';

import { projectIssueProgress } from '../projectIssueProgress';

const styles = createStaticStyles(({ css }) => ({
  metric: css`
    flex: 1;
    margin: 0;
    font-size: 12px;
    line-height: 20px;

    dt {
      display: flex;
      gap: 5px;
      align-items: center;
      color: ${cssVar.colorTextSecondary};
    }

    dd {
      margin: 0;
      padding-inline-start: 11px;
      color: ${cssVar.colorText};
    }
  `,
  marker: css`
    width: 6px;
    height: 6px;
    border-radius: 1px;
  `,
}));

const colors = {
  scope: cssVar.colorTextTertiary,
  started: cssVar.colorWarning,
  completed: cssVar.colorPrimary,
};

export function ProjectIssueProgress({ issues }: { issues: ProjectDetail['tasks'] }) {
  const { t } = useTranslation('project');
  const progress = projectIssueProgress(issues);
  if (!progress) return <span role="status">{t('overview.progressUnavailable')}</span>;
  return (
    <Flexbox horizontal gap={8}>
      {(['scope', 'started', 'completed'] as const).map((key) => (
        <dl className={styles.metric} key={key}>
          <dt>
            <span aria-hidden className={styles.marker} style={{ background: colors[key] }} />
            {t(`overview.progress.${key}`)}
          </dt>
          <dd>{progress[key]}</dd>
        </dl>
      ))}
    </Flexbox>
  );
}
