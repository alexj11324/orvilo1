'use client';

import { DatePicker, Flexbox, Icon, SortableList } from '@lobehub/ui';
import { Button, confirmModal, DropdownMenu, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import dayjs from 'dayjs';
import { CalendarIcon, EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { memo, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AccordionArrowIcon from '@/features/AgentTasks/shared/AccordionArrowIcon';
import { getProjectTasksPath } from '@/features/Projects/Layout/navigation';
import { getProjectMilestoneIssuesPath } from '@/features/Projects/milestoneFilter';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import {
  getMilestoneAnchorId,
  MILESTONE_ICON_SIZE,
  scrollToMilestoneAnchor,
} from '@/features/Projects/milestoneRow';
import { projectIssueProgress } from '@/features/Projects/projectIssueProgress';
import { formatProjectDate } from '@/features/Projects/projectPlanningDate';
import { BODY_TEXT_COLOR, SECTION_LABEL_PROPS } from '@/features/Projects/sectionLabel';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { type ProjectDetail, useProjectStore } from '@/store/project';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import MilestoneComposer from './MilestoneComposer';

type Milestone = NonNullable<ProjectDetail['milestones']>[number];
type ProjectTask = NonNullable<ProjectDetail['tasks']>[number];

/**
 * The reference keeps each card's secondary controls invisible until the
 * pointer is over the card: the drag strip, `Set target date` and `⋯` all sit
 * under an `opacity: 0` ancestor. These stable classes let the card's CSS
 * reveal them on `:hover`/`:focus-within` without a render pass.
 */
const HOVER_CONTROLS_CLASS = 'project-milestone-hover-controls';
const DRAG_HANDLE_CLASS = 'project-milestone-drag-handle';

const styles = createStaticStyles(({ css }) => ({
  addButton: css`
    align-self: flex-start;
    border-radius: 9999px;
    color: ${cssVar.colorTextSecondary};
  `,
  assignButton: css`
    cursor: pointer;

    display: flex;
    flex: none;
    gap: 4px;
    align-items: center;

    height: 24px;
    padding-block: 0;
    padding-inline: 8px;
    border: 0;
    border-radius: 9999px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  card: css`
    position: relative;

    padding-block: 8px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorBgContainer};

    &:hover
      .${HOVER_CONTROLS_CLASS},
      &:focus-within
      .${HOVER_CONTROLS_CLASS},
      &:hover
      .${DRAG_HANDLE_CLASS},
      &:focus-within
      .${DRAG_HANDLE_CLASS} {
      opacity: 1;
    }
  `,
  cardMenuOpen: css`
    .${HOVER_CONTROLS_CLASS} {
      opacity: 1;
    }
  `,
  collapseButton: css`
    cursor: pointer;

    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;

    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  datePicker: css`
    width: 118px;
    height: 28px;
    border-color: transparent;
    border-radius: 9999px;

    font-size: 13px;

    background: transparent;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  description: css`
    white-space: pre-wrap;
  `,
  descriptionGhost: css`
    cursor: pointer;

    padding-block: 0;
    padding-inline: 0;
    border: 0;

    font-size: 13px;
    color: ${cssVar.colorTextDescription};

    background: transparent;

    &:hover {
      color: ${cssVar.colorTextSecondary};
    }
  `,
  dragHandle: css`
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;

    width: 14px;
    height: 100%;
    border-radius: 8px 0 0 8px;

    opacity: 0;
  `,
  headerRow: css`
    min-height: 31px;
  `,
  hiddenControl: css`
    opacity: 0;
    transition: opacity 120ms;
  `,
  hoverControls: css`
    display: flex;
    flex: none;
    gap: 4px;
    align-items: center;

    opacity: 0;

    transition: opacity 120ms;
  `,
  milestoneIconLink: css`
    display: flex;
    flex: none;
    align-items: center;

    width: 22px;
    height: 16px;

    color: inherit;
  `,
  milestoneProgress: css`
    /* Reference: <a href="…/issues?projectMilestoneId=<id>">N issues · 100%</a>,
       13px/450, a 28px-tall hit area at the end of the milestone row. */
    display: flex;
    flex: none;
    align-items: center;

    height: 28px;
    padding-inline: 8px;
    border-radius: 9999px;

    font-size: 13px;
    font-weight: 450;
    color: ${cssVar.colorTextSecondary};

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  noMilestoneRow: css`
    min-height: 42px;
    padding-block: 6px;
    padding-inline: 4px;
    border-radius: 8px;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  section: css`
    padding-block: 16px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  unassignedBody: css`
    padding-block: 2px 6px;
    padding-inline: 30px;
  `,
  unassignedRow: css`
    min-height: 28px;
    border-radius: 6px;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
}));

interface ProjectMilestonesProps {
  detail: ProjectDetail;
}

/**
 * The overview's milestone card zone. Linear renders each milestone as a card
 * — anchor icon, editable name, collapse control, progress link — with
 * hover-only `Set target date`, `⋯` and a left-edge drag strip, a `+ Milestone`
 * button underneath, and a pinned `No milestone` row for unassigned issues.
 */
const ProjectMilestones = memo<ProjectMilestonesProps>(({ detail }) => {
  const { t } = useTranslation(['project', 'common']);
  const project = detail.project;
  const projectRef = project.slug || project.id;
  const milestones = useMemo(() => detail.milestones ?? [], [detail.milestones]);
  const tasks = useMemo(() => detail.tasks ?? [], [detail.tasks]);
  const unassignedTasks = useMemo(() => tasks.filter((task) => !task.projectMilestoneId), [tasks]);
  const unassignedProgress = projectIssueProgress(unassignedTasks);

  const userId = useUserStore(userProfileSelectors.userId);
  // `manageable()` on the server is `projects.userId = me`; ProjectLinks gates
  // the same affordances off the same check.
  const canEdit = !!project.userId && userId === project.userId;

  const createMilestone = useProjectStore((s) => s.createMilestone);
  const updateMilestone = useProjectStore((s) => s.updateMilestone);
  const deleteMilestone = useProjectStore((s) => s.deleteMilestone);
  const reorderMilestones = useProjectStore((s) => s.reorderMilestones);
  const setTaskMilestone = useProjectStore((s) => s.setTaskMilestone);

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);

  const runMutation = async (
    fn: () => Promise<unknown>,
    errorKey: 'overview.milestoneDeleteError' | 'overview.milestoneSaveError',
  ) => {
    // One write at a time: a second save racing the first would land on the
    // pre-refresh milestone list and the reorder readback settles both anyway.
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      await fn();
    } catch (error) {
      console.error('Project milestone mutation failed', error);
      toast.error(t(errorKey));
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const toggleCollapsed = (id: string) =>
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const confirmDelete = (milestone: Milestone) => {
    confirmModal({
      content: t('overview.milestoneDeleteConfirm.content', { name: milestone.name }),
      okButtonProps: { danger: true },
      okText: t('overview.milestoneDeleteConfirm.ok'),
      title: t('overview.milestoneDeleteConfirm.title'),
      onOk: () =>
        runMutation(
          () => deleteMilestone(project.id, milestone.id),
          'overview.milestoneDeleteError',
        ),
    });
  };

  const milestoneMenu = (milestone: Milestone) => [
    {
      icon: PencilIcon,
      key: 'edit',
      label: t('overview.milestoneEdit'),
      // One composer at a time — a dangling create form next to an editor
      // would read as two name fields for the same card.
      onClick: () => {
        setCreating(false);
        setEditingId(milestone.id);
      },
    },
    { type: 'divider' as const },
    {
      danger: true,
      icon: Trash2Icon,
      key: 'delete',
      label: t('overview.milestoneDelete'),
      onClick: () => confirmDelete(milestone),
    },
  ];

  const renderCard = (milestone: Milestone) => {
    const collapsed = collapsedIds.has(milestone.id);
    return (
      <div
        className={cx(styles.card, menuOpenId === milestone.id && styles.cardMenuOpen)}
        id={getMilestoneAnchorId(milestone.id)}
        style={{ flex: 1, minWidth: 0 }}
      >
        {editingId === milestone.id ? (
          <MilestoneComposer
            initial={milestone}
            saving={saving}
            onCancel={() => setEditingId(null)}
            onSubmit={async (draft) => {
              await runMutation(async () => {
                await updateMilestone(project.id, milestone.id, {
                  date: draft.date ?? null,
                  description: draft.description || null,
                  name: draft.name,
                });
                setEditingId(null);
              }, 'overview.milestoneSaveError');
            }}
          />
        ) : (
          <>
            <Flexbox horizontal align={'center'} className={styles.headerRow} gap={6}>
              <a
                aria-label={milestone.name}
                className={styles.milestoneIconLink}
                href={`#${getMilestoneAnchorId(milestone.id)}`}
                onClick={() => scrollToMilestoneAnchor(milestone.id)}
              >
                <MilestoneIcon size={MILESTONE_ICON_SIZE} />
              </a>
              <Text
                color={BODY_TEXT_COLOR}
                fontSize={15}
                style={{ flex: '0 1 auto', minWidth: 0 }}
                weight={600}
              >
                {milestone.name}
              </Text>
              <button
                className={styles.collapseButton}
                type="button"
                aria-label={t(
                  collapsed ? 'overview.milestoneExpand' : 'overview.milestoneCollapse',
                )}
                onClick={() => toggleCollapsed(milestone.id)}
              >
                <AccordionArrowIcon isOpen={!collapsed} size={16} />
              </button>
              <Flexbox flex={1} />
              {/* A `null` readout could not be computed honestly; the link and
                  its number land together or not at all. */}
              {milestone.progress && (
                <WorkspaceLink
                  className={styles.milestoneProgress}
                  to={getProjectMilestoneIssuesPath(projectRef, milestone.id)}
                >
                  {t('overview.milestoneIssues', {
                    count: milestone.progress.issues,
                    percent: milestone.progress.percent,
                  })}
                </WorkspaceLink>
              )}
              {canEdit ? (
                <>
                  {/* A set date stays on the card; only the empty "Set target
                      date" affordance waits for hover, matching the reference's
                      hover-only `Choose date` button. */}
                  <DatePicker
                    allowClear
                    aria-label={t('overview.milestoneChooseDate')}
                    disabled={saving}
                    format="MMM D"
                    placeholder={t('overview.milestoneSetDate')}
                    prefix={<Icon icon={CalendarIcon} size={13} />}
                    size="small"
                    suffixIcon={null}
                    value={milestone.date ? dayjs(milestone.date) : null}
                    className={cx(
                      styles.datePicker,
                      !milestone.date && cx(HOVER_CONTROLS_CLASS, styles.hiddenControl),
                    )}
                    onChange={(value) => {
                      const picked = Array.isArray(value) ? value[0] : value;
                      const date = picked ? picked.format('YYYY-MM-DD') : null;
                      if (date === (milestone.date ?? null)) return;
                      void runMutation(
                        () => updateMilestone(project.id, milestone.id, { date }),
                        'overview.milestoneSaveError',
                      );
                    }}
                  />
                  <div className={cx(HOVER_CONTROLS_CLASS, styles.hoverControls)}>
                    <DropdownMenu
                      items={milestoneMenu(milestone)}
                      onOpenChange={(open) => setMenuOpenId(open ? milestone.id : null)}
                    >
                      <Button
                        aria-label={t('overview.milestoneMenu')}
                        icon={EllipsisIcon}
                        size="small"
                        type="text"
                      />
                    </DropdownMenu>
                  </div>
                </>
              ) : (
                milestone.date && (
                  <Text fontSize={12} style={{ flex: 'none' }} type={'secondary'}>
                    {formatProjectDate(milestone.date)}
                  </Text>
                )
              )}
            </Flexbox>
            {!collapsed &&
              (milestone.description ? (
                <Flexbox style={{ paddingInlineStart: 28 }}>
                  <Text className={styles.description} fontSize={13} type={'secondary'}>
                    {milestone.description}
                  </Text>
                </Flexbox>
              ) : (
                canEdit && (
                  <Flexbox style={{ paddingInlineStart: 28 }}>
                    <button
                      className={styles.descriptionGhost}
                      type="button"
                      onClick={() => setEditingId(milestone.id)}
                    >
                      {t('overview.descriptionEmpty')}
                    </button>
                  </Flexbox>
                )
              ))}
          </>
        )}
        {canEdit && (
          <SortableList.DragHandle
            aria-label={t('overview.milestoneDrag')}
            className={cx(DRAG_HANDLE_CLASS, styles.dragHandle)}
          />
        )}
      </div>
    );
  };

  // Linear's overview body carries no Milestones section at all on a project
  // with zero milestones (verified live 2026-09-25 on ACP Harness): not an
  // empty state, no heading, no add button — creation starts from the rail
  // card's "+" instead. The whole section bows out, including for editors.
  if (milestones.length === 0) return null;

  return (
    <Flexbox as={'section'} className={styles.section} gap={8} id={'milestone-list'}>
      <Flexbox horizontal align={'center'} gap={7}>
        <Text {...SECTION_LABEL_PROPS}>{t('overview.milestones')}</Text>
      </Flexbox>
      <>
        <SortableList
          gap={4}
          items={milestones}
          renderItem={(milestone) => (
            <SortableList.Item id={milestone.id} key={milestone.id} variant={'borderless'}>
              {renderCard(milestone)}
            </SortableList.Item>
          )}
          renderOverlay={(milestone) => (
            <Flexbox horizontal align={'center'} className={styles.card} gap={8}>
              <MilestoneIcon size={MILESTONE_ICON_SIZE} />
              <Text color={BODY_TEXT_COLOR} fontSize={15} weight={600}>
                {milestone.name}
              </Text>
            </Flexbox>
          )}
          onChange={(items) => {
            const ids = items.map((item) => item.id);
            if (ids.join('') === milestones.map((milestone) => milestone.id).join('')) return;
            void runMutation(
              () => reorderMilestones(project.id, ids),
              'overview.milestoneSaveError',
            );
          }}
        />
        {/* The rail's fifth row in the reference: the unassigned bucket. The
              label links to the unfiltered issues page (the measured
              destination); expanding it lists the issues so one can be filed
              under a milestone — the only UI path onto `setTaskMilestone`. */}
        <div className={styles.noMilestoneRow}>
          <Flexbox horizontal align={'center'} gap={10}>
            <MilestoneIcon muted size={MILESTONE_ICON_SIZE} />
            {unassignedTasks.length > 0 ? (
              <button
                aria-expanded={unassignedOpen}
                aria-label={t('overview.noMilestone')}
                className={styles.collapseButton}
                style={{ height: 'auto', width: 'auto' }}
                type="button"
                onClick={() => setUnassignedOpen((open) => !open)}
              >
                <Text fontSize={13} type={'secondary'} weight={450}>
                  {t('overview.noMilestone')}
                </Text>
                <AccordionArrowIcon isOpen={unassignedOpen} size={14} />
              </button>
            ) : (
              <Text fontSize={13} type={'secondary'} weight={450}>
                {t('overview.noMilestone')}
              </Text>
            )}
            <Flexbox flex={1} />
            {unassignedProgress && (
              <WorkspaceLink
                className={styles.milestoneProgress}
                to={getProjectTasksPath(projectRef)}
              >
                {t('overview.milestoneIssues', {
                  count: unassignedProgress.scope,
                  percent:
                    unassignedProgress.scope === 0
                      ? 0
                      : Math.round((unassignedProgress.completed / unassignedProgress.scope) * 100),
                })}
              </WorkspaceLink>
            )}
          </Flexbox>
          {unassignedOpen &&
            unassignedTasks.map((task: ProjectTask) => (
              <Flexbox
                horizontal
                align={'center'}
                className={cx(styles.unassignedBody, styles.unassignedRow)}
                gap={8}
                key={task.id}
              >
                <Text fontSize={12} type={'secondary'}>
                  {task.identifier}
                </Text>
                <Text ellipsis fontSize={13} style={{ flex: 1, minWidth: 0 }}>
                  {task.name ?? task.identifier}
                </Text>
                {canEdit && (
                  <DropdownMenu
                    items={milestones.map((milestone) => ({
                      icon: <MilestoneIcon size={14} />,
                      key: milestone.id,
                      label: milestone.name,
                      onClick: () =>
                        void runMutation(
                          () => setTaskMilestone(project.id, task.id, milestone.id),
                          'overview.milestoneSaveError',
                        ),
                    }))}
                  >
                    <button
                      className={styles.assignButton}
                      type="button"
                      aria-label={t('overview.milestoneAssign', {
                        name: task.name ?? task.identifier,
                      })}
                    >
                      <MilestoneIcon muted size={12} />
                      {t('overview.milestoneSet')}
                    </button>
                  </DropdownMenu>
                )}
              </Flexbox>
            ))}
        </div>
      </>
      {canEdit &&
        (creating ? (
          <MilestoneComposer
            saving={saving}
            onCancel={() => setCreating(false)}
            onSubmit={async (draft) => {
              await runMutation(async () => {
                await createMilestone(project.id, {
                  date: draft.date ?? null,
                  description: draft.description || null,
                  name: draft.name,
                });
                setCreating(false);
              }, 'overview.milestoneSaveError');
            }}
          />
        ) : (
          <Button
            className={styles.addButton}
            icon={PlusIcon}
            size={'small'}
            type={'text'}
            // One composer at a time — the same rule the ⋯ edit path applies.
            onClick={() => {
              setEditingId(null);
              setCreating(true);
            }}
          >
            {t('overview.milestoneAdd')}
          </Button>
        ))}
    </Flexbox>
  );
});

ProjectMilestones.displayName = 'ProjectMilestones';

export default ProjectMilestones;
