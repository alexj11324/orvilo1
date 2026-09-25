'use client';

import { Flexbox } from '@lobehub/ui';
import { ActionIcon, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { PlusIcon } from 'lucide-react';
import { memo, type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AccordionArrowIcon from '@/features/AgentTasks/shared/AccordionArrowIcon';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { SECTION_LABEL_PROPS } from '@/features/Projects/sectionLabel';
import { useProjectDateFormatter } from '@/features/Projects/useProjectDateFormatter';
import MilestoneComposer from '@/features/Projects/Workspace/MilestoneComposer';
import ProjectPropertiesCard from '@/features/Projects/Workspace/ProjectPropertiesCard';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

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
      background: ${cssVar.colorFillTertiary};
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

    /* CDP: the reference reserves 35px before the label, with no icon. */
    padding-inline: 35px 8px;
    border-radius: 2px;

    font-size: 12px;
    font-weight: 450;
    color: ${cssVar.colorText};

    /* An opaque overlay conceals the progress readout without stacking two
       translucent hover fills. Both colors follow the active theme. */
    background:
      linear-gradient(${cssVar.colorFillTertiary}, ${cssVar.colorFillTertiary}),
      ${cssVar.colorBgContainer};
  `,
  sectionTrigger: css`
    cursor: pointer;

    display: flex;
    flex: 1;
    gap: 6px;
    align-items: center;

    min-width: 0;
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
          <AccordionArrowIcon isOpen={expanded} size={16} />
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
    const formatDate = useProjectDateFormatter();
    const detail = useCurrentProjectDetail(projectId);
    useProjectStore((s) => s.useFetchProjectDetail)(projectId);
    const createMilestone = useProjectStore((s) => s.createMilestone);
    const userId = useUserStore(userProfileSelectors.userId);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const databaseId = detail?.project.id;

    if (!detail || !databaseId) return null;

    const milestones = detail.milestones ?? [];
    const projectRef = detail.project.slug || databaseId;
    // Same owner gate the overview body uses for its milestone controls.
    const canEdit = !!detail.project.userId && userId === detail.project.userId;

    // The rail card's "+" opens an inline composer inside the card — the
    // reference keeps milestone creation here even while the overview body
    // hides its whole section on an empty project.
    const submitMilestone = async (draft: { date?: string; description: string; name: string }) => {
      if (saving) return;
      setSaving(true);
      try {
        await createMilestone(databaseId, {
          date: draft.date ?? null,
          description: draft.description || null,
          name: draft.name,
        });
        setCreating(false);
      } catch (error) {
        console.error('Project milestone creation failed', error);
        toast.error(t('overview.milestoneSaveError'));
      } finally {
        setSaving(false);
      }
    };

    return (
      <Flexbox className={styles.panel} gap={12}>
        <ProjectPanelSection title={t('overview.propertiesLabel')}>
          <ProjectPropertiesCard detail={detail} projectId={databaseId} />
        </ProjectPanelSection>
        <ProjectPanelSection
          title={t('overview.milestones', { defaultValue: 'Milestones' })}
          action={
            canEdit ? (
              <ActionIcon
                aria-label={t('overview.milestoneAdd')}
                icon={PlusIcon}
                size={'small'}
                title={t('overview.milestoneAdd')}
                onClick={() => setCreating(true)}
              />
            ) : undefined
          }
        >
          {creating && (
            <MilestoneComposer
              saving={saving}
              onCancel={() => setCreating(false)}
              onSubmit={submitMilestone}
            />
          )}
          {milestones.length === 0 ? (
            creating ? undefined : (
              <Text fontSize={12} type={'secondary'}>
                {t('overview.milestonesEmpty')}
              </Text>
            )
          ) : (
            <Flexbox gap={1}>
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
                  <Text ellipsis fontSize={12} style={{ flex: 1, minWidth: 0 }} weight={450}>
                    {milestone.name}
                  </Text>
                  {/* A `null` readout could not be computed honestly — omit it
                      rather than render it as 0%. The reference row reads
                      name → progress → date. */}
                  {milestone.progress && (
                    <Text fontSize={12} style={{ flex: 'none' }} type={'secondary'}>
                      {t('overview.milestoneProgressOf', {
                        count: milestone.progress.issues,
                        percent: milestone.progress.percent,
                      })}
                    </Text>
                  )}
                  {milestone.date && (
                    <Text fontSize={12} style={{ flex: 'none' }} type={'secondary'}>
                      {formatDate(milestone.date)}
                    </Text>
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
            </Flexbox>
          )}
        </ProjectPanelSection>
        <ProjectPanelSection title={t('overview.progressLabel', { defaultValue: 'Progress' })}>
          <ProjectIssueProgress
            assignees={detail.assignees}
            issues={detail.tasks}
            projectRef={projectRef}
            taskLabels={detail.taskLabels}
          />
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
