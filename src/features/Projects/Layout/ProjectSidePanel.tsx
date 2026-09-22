'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDownIcon, ChevronRightIcon, DiamondIcon } from 'lucide-react';
import { memo, type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getProjectMilestoneIssuesPath } from '@/features/Projects/milestoneFilter';
import { MILESTONE_ICON_PAINT, MILESTONE_ICON_SIZE } from '@/features/Projects/milestoneRow';
import { formatProjectDate } from '@/features/Projects/projectPlanningDate';
import { SECTION_LABEL_PROPS } from '@/features/Projects/sectionLabel';
import ProjectPropertiesCard from '@/features/Projects/Workspace/ProjectPropertiesCard';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';

import { ProjectCreationActivity } from '../Activity/ProjectCreationActivity';
import { getProjectActivityPath } from './navigation';
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
    scrollbar-width: thin;

    /* Linear parity: the rail's outer box must be 399px, not 412. The row is
       1186px once the nav is 244 and the shell's start gutter is gone; the
       content column needs a 787px left column, which leaves exactly 399 for
       this panel. 4px of start chrome sits outside the card (the reference's
       <aside> carries padding-left: 4px).

       The end side is the reference's own mechanism, not a stand-in for it:
       its rail scroller reserves a thin scrollbar gutter whether or not it
       scrolls (scrollbar-gutter: stable, scrollbar-width: thin — 11px here).
       An earlier 10px end padding imitated that gutter only while the rail fit
       the viewport; once it scrolled, the real scrollbar took another 11px and
       the card content shrank from 360 to 349. */
    scrollbar-gutter: stable;

    overflow-y: auto;
    flex: none;

    width: 399px;
    height: 100%;
    padding-block: 12px;
    padding-inline: 4px 0;
  `,
  railCard: css`
    /* Reference: the card's own content box starts at x=1048, 4px right of
       ours (1044). This is the *card's* start inset, not the row's label
       column — that is a 90px column with a 0 gap, already correct, and it is
       what the 1138 in §1 of the parity table decomposes to: 1048 + 90 + 0.
       With the inset fixed the same decomposition gives the same number, so
       the value column lands on 1138 instead of reaching it by coincidence.

       The start inset moved 16 -> 11 when the shell narrowed this rail from
       412 to 399: the card's content box is anchored to the rail's LEFT edge
       (panel padding + card padding + card border), so shrinking the rail by
       13px would have pushed the label column to 1061 and the value column to
       1151 unless the accumulated start chrome dropped by the same 13px. It
       now measures 4 + 11 + 1 = 16 against the reference's 16.5.

       Measured after the change: content left 1048, value x 1138, content box
       360 wide. The end padding is 11, not the reference's 12: our row is 1px
       narrower than the reference's (the shell's end border), and taking that
       pixel here keeps the content box at 1048..1408 with the stable gutter. */
    padding-block: 12px;
    padding-inline: 11px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;

    background: color-mix(in srgb, ${cssVar.colorBgContainer} 78%, transparent);
  `,
  milestoneRow: css`
    cursor: default;

    /* Reference row: 380x42 against a 360 content box, i.e. its hover
       surface reaches 10px past the card's content edge on both sides. */
    position: relative;

    display: flex;
    gap: 8px;
    align-items: center;

    height: 42px;
    margin-inline: -10px;
    padding-inline: 10px;
    border-radius: 8px;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }

    &:hover > a {
      display: flex;
    }
  `,
  seeIssues: css`
    /* Reference: display none until the row is hovered, then laid over the
       end of the row (it covers the readout rather than reflowing it). */
    position: absolute;
    inset-inline-end: 10px;

    display: none;
    align-items: center;

    height: 24px;
    padding-inline: 8px;
    border-radius: 6px;

    font-size: 12px;
    color: ${cssVar.colorText};

    background: ${cssVar.colorFillQuaternary};
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
    const databaseId = detail?.project.id;

    if (!detail || !databaseId) return null;

    const milestones = detail.milestones ?? [];
    const projectRef = detail.project.slug || databaseId;

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
            <Flexbox gap={1}>
              {milestones.map((milestone) => (
                // The row itself is not a navigation target. This used to be a
                // whole-row `role=button` that opened the project's issues —
                // the right call while the reference row was only ever read:
                // it kept the destination and one keyboard-reachable role.
                // The reference has since been measured more closely: its row
                // carries no href and `cursor: default`, and "go to issues" is
                // a separate `See issues` control that only appears on hover,
                // pointing at the milestone-filtered list rather than the whole
                // project. So the row is now inert and the destination lives on
                // that control. Keyboard users reach the same filtered list
                // from the always-visible progress link on the overview card.
                <div className={styles.milestoneRow} key={milestone.id}>
                  <Icon {...MILESTONE_ICON_PAINT} icon={DiamondIcon} size={MILESTONE_ICON_SIZE} />
                  <Text ellipsis fontSize={12} style={{ flex: 1, minWidth: 0 }} weight={450}>
                    {milestone.name}
                  </Text>
                  {milestone.date && (
                    <Text fontSize={12} style={{ flex: 'none' }} type={'secondary'}>
                      {formatProjectDate(milestone.date)}
                    </Text>
                  )}
                  {/* A `null` readout could not be computed honestly — omit it
                      rather than render it as 0%. */}
                  {milestone.progress && (
                    <Text fontSize={12} style={{ flex: 'none' }} type={'secondary'}>
                      {t('overview.milestoneProgressOf', {
                        count: milestone.progress.issues,
                        percent: milestone.progress.percent,
                      })}
                    </Text>
                  )}
                  <WorkspaceLink
                    className={styles.seeIssues}
                    tabIndex={-1}
                    to={getProjectMilestoneIssuesPath(projectRef, milestone.id)}
                  >
                    {t('overview.milestoneSeeIssues')}
                  </WorkspaceLink>
                </div>
              ))}
            </Flexbox>
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
