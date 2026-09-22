'use client';

import { Flexbox } from '@lobehub/ui';
import { Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ProjectPropertiesCard from '@/features/Projects/Workspace/ProjectPropertiesCard';
import { goalSelectors, useGoalStore } from '@/store/goal';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';

const styles = createStaticStyles(({ css }) => ({
  panel: css`
    overflow-y: auto;
    flex: none;

    width: 300px;
    height: 100%;
    padding: 12px;
    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  railCard: css`
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;
    background: color-mix(in srgb, ${cssVar.colorBgContainer} 78%, transparent);
  `,
}));

const SectionTitle = memo<{ count?: number; title: string }>(({ count, title }) => (
  <Flexbox horizontal align={'center'} gap={7}>
    <Text fontSize={14} weight={500}>
      {title}
    </Text>
    {count !== undefined && <Tag shape={'round'}>{count}</Tag>}
  </Flexbox>
));

// Linear keeps one persistent right-hand panel across every project tab
// (Overview | Activity | Issues), so it lives on the layout rather than any
// single page.
const ProjectSidePanel = memo<{ projectId: string }>(({ projectId }) => {
  const { t } = useTranslation('project');
  const detail = useCurrentProjectDetail(projectId);
  useProjectStore((s) => s.useFetchProjectDetail)(projectId);
  // The route param is often the slug, not the row id — goals key on `project.id`,
  // so wait for the detail record.
  const databaseId = detail?.project.id;
  const goalScope = `project:${databaseId ?? projectId}`;
  const goals = useGoalStore(goalSelectors.goalList(goalScope));
  useGoalStore((s) => s.useFetchGoals)(undefined, databaseId);

  if (!detail || !databaseId) return null;

  const completedGoals = goals.filter(({ goal }) => goal.status === 'achieved').length;
  // No goals (or a failed fetch) is not 0% progress — report it as unknown
  // instead of letting an error render as a real zero.
  const progress = goals.length ? Math.round((completedGoals / goals.length) * 100) : null;

  return (
    <Flexbox className={styles.panel} gap={12}>
      <Flexbox className={styles.railCard} gap={12}>
        <SectionTitle title={t('overview.propertiesLabel')} />
        <ProjectPropertiesCard detail={detail} goalProgress={progress} projectId={databaseId} />
      </Flexbox>
    </Flexbox>
  );
});

ProjectSidePanel.displayName = 'ProjectSidePanel';

export default ProjectSidePanel;
