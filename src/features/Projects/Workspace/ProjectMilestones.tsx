'use client';

import { cn } from 'cn';
import dayjs, { type Dayjs } from 'dayjs';
import { CalendarIcon, EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { createElement, memo, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DatePicker from '@/components/DatePicker';
import { confirmModal } from '@/components/Modal';
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
} from '@/components/reui/sortable';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import AccordionArrowIcon from '@/features/AgentTasks/shared/AccordionArrowIcon';
import DropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { getProjectTasksPath } from '@/features/Projects/Layout/navigation';
import { getProjectMilestoneIssuesPath } from '@/features/Projects/milestoneFilter';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import {
  getMilestoneAnchorId,
  MILESTONE_ICON_SIZE,
  scrollToMilestoneAnchor,
} from '@/features/Projects/milestoneRow';
import { projectIssueProgress } from '@/features/Projects/projectIssueProgress';
import { formatProjectDate, PROJECT_DAY_FORMAT } from '@/features/Projects/projectPlanningDate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { type ProjectDetail, useProjectStore } from '@/store/project';

import { ProjectDateInput } from './ProjectPlanningFields';
import { PROPERTY_CONTROL_CLASS } from './propertyControl';

type Milestone = NonNullable<ProjectDetail['milestones']>[number];
type ProjectTask = NonNullable<ProjectDetail['tasks']>[number];

interface MilestoneDraft {
  date?: string;
  description: string;
  name: string;
}

/**
 * The reference keeps each card's secondary controls invisible until the
 * pointer is over the card: the drag strip, `Set target date` and `⋯` all sit
 * under an `opacity: 0` ancestor. These stable classes let the card's CSS
 * reveal them on `:hover`/`:focus-within` without a render pass.
 */
const HOVER_CONTROLS_CLASS = 'project-milestone-hover-controls';
const DRAG_HANDLE_CLASS = 'project-milestone-drag-handle';

const styles = {
  addButton: 'self-start rounded-(--radius-button) text-muted-foreground',
  assignButton:
    'flex h-7 flex-none cursor-pointer items-center gap-1 rounded-(--radius-input) border-0 bg-transparent px-2 py-0 text-xs leading-5 text-muted-foreground hover:bg-fill-quaternary hover:text-foreground',
  card: 'relative rounded-(--radius-card) border border-divider bg-card p-4 [&:hover_.project-milestone-hover-controls]:opacity-100 [&:focus-within_.project-milestone-hover-controls]:opacity-100 [&:hover_.project-milestone-drag-handle]:opacity-100 [&:focus-within_.project-milestone-drag-handle]:opacity-100',
  cardMenuOpen: '[&_.project-milestone-hover-controls]:opacity-100',
  collapseButton:
    'flex size-8 min-h-8 min-w-8 flex-none cursor-pointer items-center justify-center rounded-(--radius-button) border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground',
  composer: 'rounded-(--radius-card) border border-divider p-4',
  description: 'whitespace-pre-wrap',
  descriptionGhost:
    'cursor-pointer border-0 bg-transparent px-0 py-0 text-sm leading-5.5 text-foreground-description hover:text-muted-foreground',
  dragHandle: 'absolute inset-y-0 start-0 h-full w-3.5 rounded-s-(--radius-card) opacity-0',
  headerRow: 'min-h-8',
  hiddenControl: 'opacity-0 transition-opacity duration-(--orvilo-motion-fast)',
  hoverControls:
    'flex flex-none items-center gap-1 opacity-0 transition-opacity duration-(--orvilo-motion-fast)',
  milestoneIconLink: 'flex size-8 flex-none items-center justify-center text-inherit',
  milestoneProgress:
    'flex h-7 flex-none items-center rounded-(--radius-input) px-2 text-xs leading-5 font-normal text-muted-foreground hover:bg-fill-quaternary hover:text-foreground group-focus-visible/project-progress:bg-fill-quaternary group-focus-visible/project-progress:text-foreground',
  noMilestoneRow: 'min-h-11 rounded-(--radius-card) px-1 py-1.5 hover:bg-fill-quaternary',
  section: 'border-bs border-divider py-4',
  unassignedBody: 'pbs-0.5 pbe-1.5 px-7.5',
  unassignedRow: 'min-h-11 rounded-(--radius-card) hover:bg-fill-quaternary',
};

interface MilestoneComposerProps {
  initial?: Milestone;
  onCancel: () => void;
  onSubmit: (draft: MilestoneDraft) => Promise<void>;
  saving: boolean;
}

/** Inline name/date/description editor shared by the create and edit flows. */
const MilestoneComposer = memo<MilestoneComposerProps>(
  ({ initial, onCancel, onSubmit, saving }) => {
    const { t } = useTranslation(['project', 'common']);
    const [name, setName] = useState(initial?.name ?? '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [date, setDate] = useState<string | undefined>(initial?.date ?? undefined);

    const submit = () => {
      const trimmed = name.trim();
      if (!trimmed || saving) return;
      void onSubmit({ date, description: description.trim(), name: trimmed });
    };

    return (
      <div className={cn(cn('flex flex-col', styles.composer), 'gap-2')}>
        <Input
          autoFocus
          aria-label={t('create.milestone.name')}
          placeholder={t('create.milestone.name')}
          value={name}
          visualSize="normal"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') onCancel();
          }}
        />
        <DatePicker
          allowClear
          aria-label={t('create.milestone.date')}
          format="YYYY/MM/DD"
          placeholder={t('create.milestone.date')}
          prefix={<CalendarIcon size={13} />}
          size="normal"
          suffixIcon={null}
          value={date ? dayjs(date) : null}
          onChange={(value) => {
            const picked = Array.isArray(value) ? value[0] : value;
            setDate(picked ? picked.format('YYYY-MM-DD') : undefined);
          }}
        />
        <Textarea
          aria-label={t('create.milestone.description')}
          placeholder={t('create.milestone.description')}
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className="flex flex-row [justify-content:end] gap-2">
          <Button size="lg" variant="outline" onClick={onCancel}>
            {t('common:cancel')}
          </Button>
          <Button
            aria-busy={saving}
            disabled={!name.trim() || saving}
            size="lg"
            variant="default"
            onClick={submit}
          >
            {saving && <Spinner />}
            {initial ? t('common:save') : t('create.milestone.create')}
          </Button>
        </div>
      </div>
    );
  },
);

MilestoneComposer.displayName = 'MilestoneComposer';

interface ProjectMilestonesProps {
  detail: ProjectDetail;
}

/**
 * The overview's milestone card zone. Linear renders each milestone as a card
 * — anchor icon, editable name, collapse control, progress link — with
 * hover-only `Set target date`, `⋯` and a left-edge drag strip, a `+ Milestone`
 * button underneath, and a pinned `No milestone` row for unassigned issues.
 */
/** Milestone target date: the same ghost property pill as the project dates. */
function MilestoneDateControl({
  className,
  disabled,
  onChange,
  value,
}: {
  className?: string;
  disabled: boolean;
  onChange: (date: string | null) => void;
  value?: string | null;
}) {
  const { t } = useTranslation('project');
  const [open, setOpen] = useState(false);
  const title = t('overview.milestoneChooseDate');
  const commit = (picked: Dayjs | null) => {
    setOpen(false);
    onChange(picked ? picked.format('YYYY-MM-DD') : null);
  };
  return (
    <DatePicker
      aria-label={title}
      className={cn(PROPERTY_CONTROL_CLASS, 'min-w-0 shrink', className)}
      disabled={disabled}
      format={PROJECT_DAY_FORMAT}
      open={open}
      placeholder={t('overview.milestoneSetDate')}
      prefix={<CalendarIcon aria-hidden size={16} />}
      size="small"
      suffixIcon={null}
      value={value ? dayjs(value) : null}
      variant="ghost"
      panelRender={(panel) => (
        <>
          <ProjectDateInput
            disabled={disabled}
            precision="day"
            stored={{ date: value ?? null, precision: 'day' }}
            title={title}
            onCommit={commit}
          />
          {panel}
        </>
      )}
      onChange={(value) => commit(Array.isArray(value) ? (value[0] ?? null) : value)}
      onOpenChange={setOpen}
    />
  );
}

const ProjectMilestones = memo<ProjectMilestonesProps>(({ detail }) => {
  const { t } = useTranslation(['project', 'common']);
  const project = detail.project;
  const projectRef = project.slug || project.id;
  const milestones = useMemo(() => detail.milestones ?? [], [detail.milestones]);
  const tasks = useMemo(() => detail.tasks ?? [], [detail.tasks]);
  const unassignedTasks = useMemo(() => tasks.filter((task) => !task.projectMilestoneId), [tasks]);
  const unassignedProgress = projectIssueProgress(unassignedTasks);

  const canEdit = detail.capabilities?.canEdit === true;

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
    fn: () => Promise<{ refreshError?: unknown } | void>,
    errorKey: 'overview.milestoneDeleteError' | 'overview.milestoneSaveError',
  ) => {
    // One write at a time: a second save racing the first would land on the
    // pre-refresh milestone list and the reorder readback settles both anyway.
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      const result = await fn();
      // The write committed; only the list refresh failed — don't report a
      // failed save (a retry would duplicate it), just flag the stale view.
      if (result?.refreshError) toast.warning(t('overview.milestoneRefreshError'));
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
        id={getMilestoneAnchorId(milestone.id)}
        className={cn(
          cn(styles.card, menuOpenId === milestone.id && styles.cardMenuOpen),
          'flex-1 min-w-0',
        )}
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
            <div className={cn(cn('flex flex-row', styles.headerRow), 'items-center gap-1.5')}>
              <a
                aria-label={milestone.name}
                className={styles.milestoneIconLink}
                href={`#${getMilestoneAnchorId(milestone.id)}`}
                onClick={() => scrollToMilestoneAnchor(milestone.id)}
              >
                <MilestoneIcon size={MILESTONE_ICON_SIZE} />
              </a>
              <span className="text-sm leading-5.5 font-normal flex-[0_1_auto] min-w-0">
                {milestone.name}
              </span>
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
              <div className="flex flex-col flex-1" />
              {/* A `null` readout could not be computed honestly; the link and
                  its number land together or not at all. */}
              {milestone.progress && (
                <WorkspaceLink
                  className="group/project-progress inline-flex rounded-(--radius-input) focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                  to={getProjectMilestoneIssuesPath(projectRef, milestone.id)}
                >
                  <span className={styles.milestoneProgress}>
                    {t('overview.milestoneIssues', {
                      count: milestone.progress.issues,
                      percent: milestone.progress.percent,
                    })}
                  </span>
                </WorkspaceLink>
              )}
              {canEdit ? (
                <>
                  {/* A set date stays on the card; only the empty "Set target
                      date" affordance waits for hover, matching the reference's
                      hover-only `Choose date` button. */}
                  <MilestoneDateControl
                    disabled={saving}
                    value={milestone.date}
                    className={
                      !milestone.date ? cn(HOVER_CONTROLS_CLASS, styles.hiddenControl) : undefined
                    }
                    onChange={(date) => {
                      if (date === (milestone.date ?? null)) return;
                      void runMutation(
                        () => updateMilestone(project.id, milestone.id, { date }),
                        'overview.milestoneSaveError',
                      );
                    }}
                  />
                  <div className={cn(HOVER_CONTROLS_CLASS, styles.hoverControls)}>
                    <DropdownMenu
                      items={milestoneMenu(milestone)}
                      onOpenChange={(open) => setMenuOpenId(open ? milestone.id : null)}
                    >
                      <Button aria-label={t('overview.milestoneMenu')} size="icon" variant="ghost">
                        {createElement(EllipsisIcon, { 'size': 16, 'aria-hidden': true })}
                      </Button>
                    </DropdownMenu>
                  </div>
                </>
              ) : (
                milestone.date && (
                  <span className="text-muted-foreground text-xs leading-5 flex-none">
                    {formatProjectDate(milestone.date)}
                  </span>
                )
              )}
            </div>
            {!collapsed &&
              (milestone.description ? (
                <div className="flex flex-col ps-7">
                  <span
                    className={cn(
                      cn('text-sm text-muted-foreground', styles.description),
                      'text-sm leading-5.5',
                    )}
                  >
                    {milestone.description}
                  </span>
                </div>
              ) : (
                canEdit && (
                  <div className="flex flex-col ps-7">
                    <button
                      className={styles.descriptionGhost}
                      type="button"
                      onClick={() => setEditingId(milestone.id)}
                    >
                      {t('overview.descriptionEmpty')}
                    </button>
                  </div>
                )
              ))}
          </>
        )}
        {canEdit && (
          <SortableItemHandle
            aria-label={t('overview.milestoneDrag')}
            className={cn(DRAG_HANDLE_CLASS, styles.dragHandle)}
          />
        )}
      </div>
    );
  };

  return (
    <section className={cn(cn('flex flex-col', styles.section), 'gap-2')} id={'milestone-list'}>
      <div className="flex flex-row items-center gap-1.75">
        <span className="text-muted-foreground text-xs leading-5 font-medium">
          {t('overview.milestones')}
        </span>
      </div>
      {milestones.length === 0 ? (
        <span className="text-muted-foreground text-sm leading-5.5 py-1">
          {t('overview.milestonesEmpty')}
        </span>
      ) : (
        <>
          <Sortable
            className="flex flex-col gap-1"
            getItemValue={(milestone) => milestone.id}

            value={milestones}
            onValueChange={() => {}}
            onValueCommit={(items) => {
              const ids = items.map((item) => item.id);
              if (ids.join('') === milestones.map((milestone) => milestone.id).join('')) return;
              void runMutation(
                () => reorderMilestones(project.id, ids),
                'overview.milestoneSaveError',
              );
            }}
          >
            {milestones.map((milestone) => (
              <SortableItem key={milestone.id} value={milestone.id}>
                {renderCard(milestone)}
              </SortableItem>
            ))}
            <SortableOverlay>
              {({ value }) => {
                const milestone = milestones.find((item) => item.id === value);
                if (!milestone) return null;
                return (
                  <div className={cn(cn('flex flex-row', styles.card), 'items-center gap-2')}>
                    <MilestoneIcon size={MILESTONE_ICON_SIZE} />
                    <span className="text-sm leading-5.5 font-normal">{milestone.name}</span>
                  </div>
                );
              }}
            </SortableOverlay>
          </Sortable>
          {/* The rail's fifth row in the reference: the unassigned bucket. The
              label links to the unfiltered issues page (the measured
              destination); expanding it lists the issues so one can be filed
              under a milestone — the only UI path onto `setTaskMilestone`. */}
          <div className={styles.noMilestoneRow}>
            <div className="flex flex-row items-center gap-2.5">
              <MilestoneIcon muted size={MILESTONE_ICON_SIZE} />
              {unassignedTasks.length > 0 ? (
                <button
                  aria-expanded={unassignedOpen}
                  aria-label={t('overview.noMilestone')}
                  className={cn(styles.collapseButton, 'h-auto w-auto')}

                  type="button"
                  onClick={() => setUnassignedOpen((open) => !open)}
                >
                  <span className="text-muted-foreground text-sm leading-5.5 font-normal">
                    {t('overview.noMilestone')}
                  </span>
                  <AccordionArrowIcon isOpen={unassignedOpen} size={14} />
                </button>
              ) : (
                <span className="text-muted-foreground text-sm leading-5.5 font-normal">
                  {t('overview.noMilestone')}
                </span>
              )}
              <div className="flex flex-col flex-1" />
              {unassignedProgress && (
                <WorkspaceLink
                  className="group/project-progress inline-flex rounded-(--radius-input) focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                  to={getProjectTasksPath(projectRef)}
                >
                  <span className={styles.milestoneProgress}>
                    {t('overview.milestoneIssues', {
                      count: unassignedProgress.scope,
                      percent:
                        unassignedProgress.scope === 0
                          ? 0
                          : Math.round(
                              (unassignedProgress.completed / unassignedProgress.scope) * 100,
                            ),
                    })}
                  </span>
                </WorkspaceLink>
              )}
            </div>
            {unassignedOpen &&
              unassignedTasks.map((task: ProjectTask) => (
                <div
                  key={task.id}
                  className={cn(
                    cn('flex flex-row', cn(styles.unassignedBody, styles.unassignedRow)),
                    'items-center gap-2',
                  )}
                >
                  <span className="font-mono text-muted-foreground text-xs leading-5">
                    {task.identifier}
                  </span>
                  <span className="truncate text-sm leading-5.5 flex-1 min-w-0">
                    {task.name ?? <span className="font-mono">{task.identifier}</span>}
                  </span>
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
                </div>
              ))}
          </div>
        </>
      )}
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
            size="lg"
            variant="ghost"
            onClick={() => {
              setEditingId(null);
              setCreating(true);
            }}
          >
            {createElement(PlusIcon, { 'size': 16, 'aria-hidden': true })}
            {t('overview.milestoneAdd')}
          </Button>
        ))}
    </section>
  );
});

ProjectMilestones.displayName = 'ProjectMilestones';

export default ProjectMilestones;
