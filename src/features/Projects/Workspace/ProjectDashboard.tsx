'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { DiamondIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatProjectDate } from '@/features/Projects/projectPlanningDate';
import type { ProjectDetail } from '@/store/project';

const styles = createStaticStyles(({ css }) => ({
  main: css`
    min-width: 0;
    margin-block-start: 24px;
  `,
  milestone: css`
    padding-block: 6px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: 0;
    }
  `,
  section: css`
    padding-block: 16px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

interface ProjectDashboardProps {
  detail: ProjectDetail;
  projectId: string;
}

/**
 * Project overview body below the update composer. Linear's overview shows a
 * single Milestones section here; goals, in-flight tasks and orchestration
 * live on their own pages/tabs, not on the overview.
 */
const ProjectDashboard = memo<ProjectDashboardProps>(({ detail }) => {
  const { t } = useTranslation('project');
  const milestones = detail.milestones ?? [];

  return (
    <Flexbox className={styles.main} gap={24}>
      <Flexbox className={styles.section} gap={10}>
        <Flexbox horizontal align={'center'} gap={7}>
          <Text fontSize={16} weight={600}>
            {t('overview.milestones')}
          </Text>
        </Flexbox>
        {milestones.length === 0 ? (
          <Text fontSize={13} style={{ paddingBlock: 4 }} type={'secondary'}>
            {t('overview.milestonesEmpty')}
          </Text>
        ) : (
          <Flexbox gap={0}>
            {milestones.map((milestone) => (
              <Flexbox
                horizontal
                align={'center'}
                className={styles.milestone}
                gap={10}
                key={milestone.id}
              >
                <Icon icon={DiamondIcon} size={14} />
                <Text ellipsis fontSize={13} style={{ flex: 1, minWidth: 0 }} weight={500}>
                  {milestone.name}
                </Text>
                {milestone.date && (
                  <Text fontSize={12} type={'secondary'}>
                    {formatProjectDate(milestone.date)}
                  </Text>
                )}
              </Flexbox>
            ))}
          </Flexbox>
        )}
      </Flexbox>
    </Flexbox>
  );
});

ProjectDashboard.displayName = 'ProjectDashboard';

export default ProjectDashboard;
