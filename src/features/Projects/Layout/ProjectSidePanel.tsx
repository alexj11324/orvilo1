'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDownIcon, ChevronRightIcon, DiamondIcon } from 'lucide-react';
import { memo, type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatProjectDate } from '@/features/Projects/projectPlanningDate';
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
  sectionTrigger: css`
    cursor: pointer;

    display: flex;
    gap: 6px;
    align-items: center;

    width: 100%;
    min-height: 28px;
    padding: 0;
    border: 0;

    color: ${cssVar.colorTextSecondary};
    text-align: start;

    background: transparent;
  `,
}));

export function ProjectPanelSection({ children, title }: { children: ReactNode; title: string }) {
  const { t } = useTranslation('project');
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  return (
    <Flexbox className={styles.railCard} gap={expanded ? 8 : 0}>
      <button
        aria-controls={contentId}
        aria-expanded={expanded}
        className={styles.sectionTrigger}
        type="button"
        aria-label={t(expanded ? 'overview.collapseSection' : 'overview.expandSection', {
          section: title.toLocaleLowerCase(),
        })}
        onClick={() => setExpanded((value) => !value)}
      >
        <Text fontSize={13} type={'secondary'} weight={500}>
          {title}
        </Text>
        <Icon icon={expanded ? ChevronDownIcon : ChevronRightIcon} size={12} />
      </button>
      <div hidden={!expanded} id={contentId}>
        <Flexbox gap={8}>{children}</Flexbox>
      </div>
    </Flexbox>
  );
}

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
  const milestones = detail.milestones ?? [];

  return (
    <Flexbox className={styles.panel} gap={12}>
      <ProjectPanelSection title={t('overview.propertiesLabel')}>
        <ProjectPropertiesCard detail={detail} projectId={databaseId} />
      </ProjectPanelSection>
      <ProjectPanelSection title={t('overview.milestones', { defaultValue: 'Milestones' })}>
        {milestones.length === 0 ? (
          <Text fontSize={12} type={'secondary'}>
            {t('overview.milestonesEmpty')}
          </Text>
        ) : (
          milestones.map((milestone) => (
            <Flexbox horizontal align={'center'} gap={8} key={milestone.id}>
              <Icon color={cssVar.colorPrimary} icon={DiamondIcon} size={12} />
              <Text ellipsis fontSize={12} style={{ flex: 1, minWidth: 0 }}>
                {milestone.name}
              </Text>
              {milestone.date && (
                <Text fontSize={12} type={'secondary'}>
                  {formatProjectDate(milestone.date)}
                </Text>
              )}
            </Flexbox>
          ))
        )}
      </ProjectPanelSection>
      {progress !== null && (
        <ProjectPanelSection title={t('overview.progressLabel', { defaultValue: 'Progress' })}>
          <Flexbox horizontal align={'center'} gap={8}>
            <Text fontSize={12} type={'secondary'}>
              {t('overview.progressCompleted', {
                completed: completedGoals,
                defaultValue: 'Completed',
                total: goals.length,
              })}
            </Text>
            <Text fontSize={12} weight={500}>
              {progress}%
            </Text>
          </Flexbox>
        </ProjectPanelSection>
      )}
    </Flexbox>
  );
});

ProjectSidePanel.displayName = 'ProjectSidePanel';

export default ProjectSidePanel;
