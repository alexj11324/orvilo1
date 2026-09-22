'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDownIcon, ChevronRightIcon, DiamondIcon } from 'lucide-react';
import { type KeyboardEvent, memo, type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MILESTONE_ICON_COLOR, MILESTONE_ICON_SIZE } from '@/features/Projects/milestoneRow';
import { formatProjectDate } from '@/features/Projects/projectPlanningDate';
import { SECTION_LABEL_PROPS } from '@/features/Projects/sectionLabel';
import ProjectPropertiesCard from '@/features/Projects/Workspace/ProjectPropertiesCard';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';

import { ProjectCreationActivity } from '../Activity/ProjectCreationActivity';
import { getProjectActivityPath, getProjectTasksPath } from './navigation';
import { ProjectIssueProgress } from './ProjectIssueProgress';

const styles = createStaticStyles(({ css }) => ({
  activityLink: css`
    flex: none;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  panel: css`
    overflow-y: auto;
    flex: none;

    width: 412px;
    height: 100%;
    padding: 12px;
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

export function ProjectPanelSection({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  const { t } = useTranslation('project');
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  return (
    <Flexbox className={styles.railCard} gap={expanded ? 8 : 0}>
      <Flexbox horizontal align="center" gap={8}>
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
          <Text {...SECTION_LABEL_PROPS}>{title}</Text>
          <Icon icon={expanded ? ChevronDownIcon : ChevronRightIcon} size={12} />
        </button>
        {action}
      </Flexbox>
      <div hidden={!expanded} id={contentId}>
        <Flexbox gap={8}>{children}</Flexbox>
      </div>
    </Flexbox>
  );
}

// Linear keeps one persistent right-hand panel across every project tab
// (Overview | Activity | Issues), so it lives on the layout rather than any
// single page.
const ProjectSidePanel = memo<{ projectId: string; showActivity?: boolean }>(
  ({ projectId, showActivity }) => {
    const { t } = useTranslation('project');
    const detail = useCurrentProjectDetail(projectId);
    useProjectStore((s) => s.useFetchProjectDetail)(projectId);
    const navigate = useWorkspaceAwareNavigate();
    const databaseId = detail?.project.id;

    if (!detail || !databaseId) return null;

    const milestones = detail.milestones ?? [];
    const openIssues = () => navigate(getProjectTasksPath(detail.project.slug || databaseId));
    const activateIssues = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      // Space would otherwise scroll the panel.
      event.preventDefault();
      openIssues();
    };

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
              // Whole-row target opening the project's issues, not a link: the
              // `#milestone-<id>` anchor belongs to the overview card alone, and
              // the rail is mounted on every project tab, so pointing it at that
              // anchor would be a dead link off Overview.
              //
              // Deliberately diverges from the reference in two ways. It renders
              // the row as two nested `div[role=button]` layers, both
              // `tabindex="-1"` — mouse-only, and a button inside a button. The
              // clone contract asks to preserve accessibility while matching the
              // reference, so this keeps one button role and stays reachable by
              // keyboard. The destination, and the row's `role`, do match.
              <div
                key={milestone.id}
                role={'button'}
                tabIndex={0}
                onClick={openIssues}
                onKeyDown={activateIssues}
              >
                <Flexbox horizontal align={'center'} gap={8}>
                  <Icon
                    color={MILESTONE_ICON_COLOR}
                    fill={MILESTONE_ICON_COLOR}
                    icon={DiamondIcon}
                    size={MILESTONE_ICON_SIZE}
                  />
                  <Text ellipsis fontSize={12} style={{ flex: 1, minWidth: 0 }} weight={450}>
                    {milestone.name}
                  </Text>
                  {milestone.date && (
                    <Text fontSize={12} type={'secondary'}>
                      {formatProjectDate(milestone.date)}
                    </Text>
                  )}
                </Flexbox>
              </div>
            ))
          )}
        </ProjectPanelSection>
        <ProjectPanelSection title={t('overview.progressLabel', { defaultValue: 'Progress' })}>
          <ProjectIssueProgress issues={detail.tasks} />
        </ProjectPanelSection>
        {showActivity && (
          <ProjectPanelSection
            title={t('activity.title')}
            action={
              <WorkspaceLink
                className={styles.activityLink}
                to={getProjectActivityPath(detail.project.slug || databaseId)}
              >
                {t('activity.seeAll')}
              </WorkspaceLink>
            }
          >
            <ProjectCreationActivity project={detail.project} />
          </ProjectPanelSection>
        )}
      </Flexbox>
    );
  },
);

ProjectSidePanel.displayName = 'ProjectSidePanel';

export default ProjectSidePanel;
