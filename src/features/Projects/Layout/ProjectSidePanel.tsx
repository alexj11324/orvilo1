'use client';
import { cn } from 'cn';
import { memo, type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import AccordionArrowIcon from '@/features/AgentTasks/shared/AccordionArrowIcon';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { formatProjectDate } from '@/features/Projects/projectPlanningDate';
import ProjectPropertiesCard from '@/features/Projects/Workspace/ProjectPropertiesCard';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';

import { ProjectCreationActivity } from '../Activity/ProjectCreationActivity';
import { getProjectActivityPath, getProjectTasksPath } from './navigation';
import { ProjectIssueProgress } from './ProjectIssueProgress';

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

/* Reference row: 380x42 against a 360 content box, i.e. its hover
       surface reaches 10px past the card's content edge on both sides. */

/* Reference: display none until the row is hovered, then laid over the
       end of the row (it covers the readout rather than reflowing it). */

/* The label-only compact navigation uses the standard 8px inline inset.
       It has no glyph whose space needs to be reserved before the label. */

/* An opaque overlay conceals the progress readout without stacking two
       translucent hover fills. Both colors follow the active theme. */

const styles = {
  activityLink: 'flex-none text-xs leading-5 text-muted-foreground hover:text-foreground',
  panel:
    '[scrollbar-width:thin] [scrollbar-gutter:stable] overflow-y-auto flex-none w-99.75 h-full py-3 ps-1 pe-0',
  railCard:
    'py-3 [padding-inline:11px] border border-divider rounded-(--radius-card) bg-[color-mix(in_srgb,var(--card)_78%,transparent)]',
  milestoneRow:
    'cursor-default relative flex gap-2 items-center h-10.5 -mx-2.5 px-2.5 rounded-(--radius-card) hover:bg-accent hover:[&>a]:flex focus-within:[&>a]:flex',
  seeIssues:
    'absolute inset-e-2.5 hidden items-center min-h-8 px-2 rounded-(--radius-button) text-xs leading-5 font-normal text-foreground bg-card wash-muted',
  sectionTrigger:
    'flex flex-1 gap-1.5 justify-start min-w-0 p-0 text-muted-foreground text-start bg-transparent hover:bg-accent',
};

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
    <div className={cn('flex flex-col', styles.railCard, expanded ? 'gap-2' : 'gap-0')}>
      <div className="flex flex-row items-center gap-2">
        <Button
          aria-controls={contentId}
          aria-expanded={expanded}
          className={styles.sectionTrigger}
          size="normal"
          type="button"
          variant="ghost"
          aria-label={t(expanded ? 'overview.collapseSection' : 'overview.expandSection', {
            section: title.toLocaleLowerCase(),
          })}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="text-(length:--text-dense) leading-5.5 font-medium text-muted-foreground">
            {title}
          </span>
          <AccordionArrowIcon isOpen={expanded} size={16} />
        </Button>
        {action}
      </div>
      <div hidden={!expanded} id={contentId}>
        <div className="flex flex-col gap-2">{children}</div>
      </div>
    </div>
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
      <div className={cn('flex flex-col gap-3', styles.panel)}>
        <ProjectPanelSection title={t('overview.propertiesLabel')}>
          <ProjectPropertiesCard detail={detail} projectId={databaseId} />
        </ProjectPanelSection>
        <ProjectPanelSection title={t('overview.milestones', { defaultValue: 'Milestones' })}>
          {milestones.length === 0 ? (
            <span className="text-xs leading-5 text-muted-foreground">
              {t('overview.milestonesEmpty')}
            </span>
          ) : (
            <div className="flex flex-col gap-px">
              {milestones.map((milestone) => (
                // The row itself is not a navigation target. This used to be a
                // whole-row `role=button` that opened the project's issues —
                // the right call while the reference row was only ever read:
                // it kept the destination and one keyboard-reachable role.
                // The reference has since been measured more closely: its row
                // carries no href and `cursor: default`, and "go to issues" is
                // a separate `See issues` control that only appears on hover.
                // Measured on click, that control lands on the project's
                // issues with `location.search` EMPTY — the unfiltered list,
                // not a milestone-filtered one (reference-inventory §3.2). So
                // the row is inert and this link opens `/tasks` plain. The
                // milestone-filtered list stays reachable from the overview
                // card's always-visible progress link.
                <div className={styles.milestoneRow} key={milestone.id}>
                  <MilestoneIcon />
                  <span className="text-xs leading-5 truncate font-normal flex-1 min-w-0">
                    {milestone.name}
                  </span>
                  {milestone.date && (
                    <span className="text-xs leading-5 text-muted-foreground flex-none">
                      {formatProjectDate(milestone.date)}
                    </span>
                  )}
                  {/* A `null` readout could not be computed honestly — omit it
                      rather than render it as 0%. */}
                  {milestone.progress && (
                    <span className="text-xs leading-5 text-muted-foreground flex-none">
                      {t('overview.milestoneProgressOf', {
                        count: milestone.progress.issues,
                        percent: milestone.progress.percent,
                      })}
                    </span>
                  )}
                  <WorkspaceLink
                    className={styles.seeIssues}
                    tabIndex={-1}
                    to={getProjectTasksPath(projectRef)}
                  >
                    {t('overview.milestoneSeeIssues')}
                  </WorkspaceLink>
                </div>
              ))}
            </div>
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
      </div>
    );
  },
);

ProjectSidePanel.displayName = 'ProjectSidePanel';

export default ProjectSidePanel;
