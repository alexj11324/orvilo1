'use client';
import type { ProjectHealth } from '@orvilo/types';
import { cn } from 'cn';
import dayjs, { type Dayjs } from 'dayjs';
import type { ReactNode } from 'react';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { PROJECT_STATUS_VISUALS, resolveProjectStatus } from '@/components/ExecutionStatus';
import { PriorityIcon, resolvePriorityLevel } from '@/components/PriorityIcon';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PROJECT_HEALTH_META, ProjectHealthIcon } from '@/features/Projects/healthMeta';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { ProjectIcon } from '@/features/Projects/ProjectIcon';
import { formatProjectDay } from '@/features/Projects/projectPlanningDate';
import { ProjectStatusIcon } from '@/features/Projects/ProjectStatusIcon';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useProjectStore } from '@/store/project';
import type { ProjectListItem } from '@/store/project/store';

import type { ProjectListDisplayOptions, ProjectListGroup } from './displayOptions';
import {
  buildTimelineAxis,
  clusterTimelineMilestones,
  resolveTimelineRange,
  TIMELINE_DAY_WIDTH,
  TIMELINE_MONTH_ROW_HEIGHT,
  timelineBarRect,
  timelinePlaceholderRect,
  type TimelineRange,
} from './timelineGeometry';

const styles = {
  axisContent: 'relative min-w-full',
  axisScroll: 'min-w-0 flex-1 overflow-x-auto overscroll-contain',
  bar: 'absolute inset-bs-1/2 block h-2.5 -translate-y-1/2 overflow-hidden rounded-full',
  barFill: 'block h-full rounded-[inherit]',
  cellIcons: 'relative z-1 flex flex-none items-center gap-1.5 text-foreground-tertiary',
  controls: 'flex flex-none items-center gap-1.5',
  controlsOverlay:
    'absolute inset-bs-1 end-2 z-3 rounded-(--radius-overlay) bg-card p-0.5 shadow-(--shadow-popover)',
  groupLabel:
    'sticky start-0 inline-flex items-center gap-2 px-3 text-xs leading-5 text-muted-foreground whitespace-nowrap',
  groupRow: 'flex items-center border-be border-divider bg-fill-quaternary',
  listCell: 'relative flex items-center gap-2 border-be border-divider px-3 hover:bg-accent',
  listColumn: 'w-66 flex-none border-e border-divider',
  listHeader: 'flex items-center justify-end gap-2 border-be border-divider px-2',
  monthCell:
    'absolute inset-y-0 flex items-center border-s border-divider px-2 text-xs leading-5 font-medium text-foreground-tertiary whitespace-nowrap',
  monthGridline: 'pointer-events-none absolute inset-y-0 w-px bg-divider',
  monthRow: 'relative border-be border-divider',
  overlayMark:
    'absolute inset-bs-1/2 z-2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 text-xs leading-5 text-muted-foreground',
  placeholderBar:
    'absolute inset-bs-1/2 flex min-h-6 -translate-y-1/2 items-center justify-center rounded-(--radius-chip) border border-dashed border-border text-xs leading-5 text-foreground-quaternary whitespace-nowrap',
  row: 'relative border-be border-divider hover:bg-fill-quaternary',
  rowLink: 'absolute inset-0 rounded-[inherit] text-inherit',
  timeline: 'relative flex min-w-0 items-start',
  todayColumn: 'pointer-events-none absolute inset-y-0 w-1 bg-primary opacity-8',
  todayLine: 'pointer-events-none absolute inset-y-0 w-px bg-primary',
  todayPill:
    'pointer-events-none absolute inset-bs-0.75 z-2 -translate-x-1/2 rounded-full bg-primary px-1.25 py-0.25 text-xs leading-5 font-semibold text-primary-foreground whitespace-nowrap',
  weekCell:
    'absolute inset-y-0 flex items-center justify-center border-s border-divider text-xs leading-5 text-foreground-quaternary',
  weekRow: 'relative bg-fill-quaternary',
};

const PROJECT_PRIORITY_KEY = {
  0: 'noPriority',
  1: 'urgent',
  2: 'high',
  3: 'normal',
  4: 'low',
} as const;

/** Health glyph for the list-column icon strip — same dot semantics the table cell uses. */
const TimelineHealthIcon = memo<{ health?: null | string }>(({ health }) => {
  const { t } = useTranslation('project');
  const valid = health && health in PROJECT_HEALTH_META ? (health as ProjectHealth) : null;
  const label = valid ? t(PROJECT_HEALTH_META[valid].key) : t('list.health.noUpdates');
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span aria-label={label} role="img">
            <ProjectHealthIcon health={valid} size={12} />
          </span>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
});

TimelineHealthIcon.displayName = 'TimelineHealthIcon';

/** Clamped 0–100 completion, or `null` while the server can't compute one. */
const projectProgress = (project: Pick<ProjectListItem, 'progressPercent'>): number | null =>
  typeof project.progressPercent === 'number'
    ? Math.min(100, Math.max(0, project.progressPercent))
    : null;

interface TimelineRowProps {
  leadAvatar: (userId: string) => string | undefined;
  leadName: (userId: string) => string | undefined;
  now: Dayjs;
  project: ProjectListItem;
  range: TimelineRange;
  showLead: boolean;
  showMilestones: boolean;
}

/**
 * One project row on the axis: the start→target bar (or the honest
 * single-bound / unscheduled fallbacks), milestone diamonds at their dates and
 * the lead avatar pinned to the bar's right edge.
 *
 * Milestones are not in the `project.list` payload — the row fetches the
 * project detail (SWR-deduped per id; the response also hydrates the shared
 * `projectDetails` cache the list's milestone chip reads) only while the
 * Milestones property is on.
 */
const TimelineRow = memo<TimelineRowProps>(
  ({ leadAvatar, leadName, now, project, range, showLead, showMilestones }) => {
    const { t } = useTranslation('project');
    const detailSWR = useProjectStore((s) => s.useFetchProjectDetail)(
      showMilestones ? project.id : undefined,
    );
    const status = resolveProjectStatus(project.status);
    const statusColor = PROJECT_STATUS_VISUALS[status].color;
    const rect = timelineBarRect(project, range);
    const placeholder = rect ? null : timelinePlaceholderRect(range, now);
    const marks = useMemo(
      () =>
        clusterTimelineMilestones(
          showMilestones ? detailSWR.data?.data.milestones : undefined,
          range,
        ),
      [detailSWR.data, range, showMilestones],
    );
    const lead = project.leadUserId;
    const leadDisplayName = lead ? (leadName(lead) ?? lead) : undefined;
    const progress = projectProgress(project);
    const barRight = rect
      ? rect.left + rect.width
      : placeholder
        ? placeholder.left + placeholder.width
        : null;

    const rangeLabel = [
      project.startDate ? formatProjectDay(project.startDate) : null,
      project.targetDate ? formatProjectDay(project.targetDate) : null,
    ]
      .filter(Boolean)
      .join(' → ');

    return (
      <div className={cn(styles.row, 'h-10')}>
        <WorkspaceLink
          aria-label={project.name}
          className={styles.rowLink}
          title={rangeLabel ? `${project.name} — ${rangeLabel}` : project.name}
          to={`/project/${project.slug ?? project.id}`}
        >
          {rect ? (
            <span
              className={styles.bar}
              style={{
                background: `color-mix(in srgb, ${statusColor} 20%, transparent)`,
                left: rect.left,
                maskImage:
                  rect.fade === 'end'
                    ? 'linear-gradient(to right, black 60%, transparent)'
                    : rect.fade === 'start'
                      ? 'linear-gradient(to left, black 60%, transparent)'
                      : undefined,
                width: rect.width,
              }}
            >
              {progress === null ? null : (
                <span
                  className={styles.barFill}
                  style={{
                    background: `color-mix(in srgb, ${statusColor} 55%, transparent)`,
                    width: `${progress}%`,
                  }}
                />
              )}
            </span>
          ) : placeholder ? (
            <span
              className={styles.placeholderBar}
              style={{ left: placeholder.left, width: placeholder.width }}
            >
              {t('list.timeline.setDates')}
            </span>
          ) : null}
          {marks.map((mark) => (
            <span
              className={styles.overlayMark}
              key={`${mark.offset}:${mark.count}`}
              style={{ left: mark.offset }}
              title={mark.names.join(', ')}
            >
              <MilestoneIcon size={10} />
              {mark.count > 1 ? <span>+{mark.count - 1}</span> : null}
            </span>
          ))}
          {showLead && lead && barRight !== null ? (
            <span className={styles.overlayMark} style={{ left: barRight }} title={leadDisplayName}>
              <Avatar avatar={leadAvatar(lead)} name={leadDisplayName} shape="circle" size={18} />
            </span>
          ) : null}
        </WorkspaceLink>
      </div>
    );
  },
);

TimelineRow.displayName = 'TimelineRow';

interface ProjectTimelineProps {
  /** Group-label renderer shared with the list layout (status icon / lead name). */
  groupLabel: (groupKey: string) => ReactNode;
  groups: ProjectListGroup<ProjectListItem>[];
  leadAvatar: (userId: string) => string | undefined;
  leadName: (userId: string) => string | undefined;
  options: ProjectListDisplayOptions;
}

/**
 * The `/projects` Timeline layout (ref-projects-timeline.png, NEW-FINDINGS §4):
 * a fixed project column + a horizontally scrolling month axis with an
 * optional ISO week-number row, a Today marker, and `startDate→targetDate`
 * bars with milestone diamonds. Ordering/grouping/closed-window display
 * options apply to the rows exactly as in the list layout.
 */
const ProjectTimeline = memo<ProjectTimelineProps>(
  ({ groupLabel, groups, leadAvatar, leadName, options }) => {
    const { t } = useTranslation('project');
    const scrollRef = useRef<HTMLDivElement>(null);
    const didInitScroll = useRef(false);
    // The axis is anchored at mount time; an overnight session does not drag
    // "today" — the next layout switch re-mounts and re-anchors.
    const [now] = useState(() => dayjs());

    const allProjects = useMemo(() => groups.flatMap((group) => group.items), [groups]);
    const range = useMemo(() => resolveTimelineRange(allProjects, now), [allProjects, now]);
    const axis = useMemo(() => buildTimelineAxis(range, TIMELINE_DAY_WIDTH, now), [now, range]);

    const headerHeight = options.timeline.showWeekNumbers ? TIMELINE_MONTH_ROW_HEIGHT + 20 : 32;
    const showProjectList = options.timeline.showProjectList;

    const scrollToOffset = (offset: number) => {
      const element = scrollRef.current;
      if (!element) return;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      element.scrollTo({
        behavior: reduceMotion ? 'auto' : 'smooth',
        left: Math.max(0, offset - element.clientWidth * 0.25),
      });
    };

    // Open the axis with Today in view, once — later range recomputes must not
    // yank the scroll position out from under the user.
    useLayoutEffect(() => {
      if (didInitScroll.current || axis.todayOffset === null) return;
      const element = scrollRef.current;
      if (!element) return;
      didInitScroll.current = true;
      element.scrollLeft = Math.max(0, axis.todayOffset - element.clientWidth * 0.25);
    }, [axis.todayOffset]);

    const controls = (
      <div className={styles.controls}>
        <Button
          size="compact"
          variant="ghost"
          onClick={() => axis.todayOffset !== null && scrollToOffset(axis.todayOffset)}
        >
          {t('list.timeline.today')}
        </Button>
        <Select
          defaultValue={now.year()}
          items={axis.years.map((year) => ({ label: String(year), value: year }))}
          onValueChange={(value) => {
            if (typeof value !== 'number') return;
            const january = dayjs().year(value).startOf('year');
            scrollToOffset(january.diff(range.start, 'day') * TIMELINE_DAY_WIDTH);
          }}
        >
          <SelectTrigger aria-label={t('list.timeline.yearJump')} className="w-21" size="compact">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {axis.years
              .map((year) => ({ label: String(year), value: year }))
              .map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    );

    return (
      <div className={styles.timeline}>
        {showProjectList ? (
          <div className={styles.listColumn}>
            <div className={styles.listHeader} style={{ height: headerHeight }}>
              {controls}
            </div>
            {groups.map((group) => (
              <div key={group.key}>
                {group.key === 'all' ? null : <div className={cn(styles.groupRow, 'h-8')} />}
                {group.items.map((project) => {
                  const status = resolveProjectStatus(project.status);
                  const priority = resolvePriorityLevel(project.priority);
                  const progress = projectProgress(project);
                  const lead = project.leadUserId;
                  const leadDisplayName = lead ? (leadName(lead) ?? lead) : undefined;
                  return (
                    <div className={cn(styles.listCell, 'h-10')} key={project.id}>
                      <WorkspaceLink
                        aria-label={project.name}
                        className={styles.rowLink}
                        to={`/project/${project.slug ?? project.id}`}
                      />
                      {project.avatar && project.avatar !== '📦' ? (
                        <Avatar
                          avatar={project.avatar}
                          name={project.name}
                          shape="square"
                          size={18}
                        />
                      ) : (
                        <ProjectIcon color="var(--foreground-tertiary)" size={16} />
                      )}
                      {options.properties.id ? (
                        <span className="text-muted-foreground text-xs leading-5">
                          {project.identifier}
                        </span>
                      ) : null}
                      <span className="truncate text-sm leading-5.5 font-medium flex-1 min-w-0">
                        {project.name}
                      </span>
                      <span className={styles.cellIcons}>
                        {options.properties.status ? (
                          <span aria-label={t(`status.${status}`)} role="img">
                            <ProjectStatusIcon percent={progress ?? 0} size={16} status={status} />
                          </span>
                        ) : null}
                        {options.properties.priority ? (
                          <PriorityIcon
                            aria-label={t(`create.priority.${PROJECT_PRIORITY_KEY[priority]}`)}
                            priority={priority}
                            role="img"
                            size={14}
                          />
                        ) : null}
                        {options.properties.health ? (
                          <TimelineHealthIcon health={project.health} />
                        ) : null}
                        {options.properties.lead && lead ? (
                          <Avatar
                            avatar={leadAvatar(lead)}
                            name={leadDisplayName}
                            shape="circle"
                            size={18}
                            title={leadDisplayName}
                          />
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
        <div className={styles.axisScroll} ref={scrollRef}>
          <div className={styles.axisContent} style={{ width: axis.totalWidth }}>
            {/* Month separators run through the whole body, under the bars. */}
            {axis.months.slice(1).map((month) => (
              <span
                className={styles.monthGridline}
                key={month.key}
                style={{ left: month.offset }}
              />
            ))}
            <div className="relative" style={{ height: headerHeight }}>
              <div
                className={cn(styles.monthRow, options.timeline.showWeekNumbers ? 'h-6.5' : 'h-8')}
              >
                {axis.months.map((month) => (
                  <div
                    className={styles.monthCell}
                    key={month.key}
                    style={{ left: month.offset, width: month.width }}
                  >
                    {month.label}
                  </div>
                ))}
                {axis.todayOffset === null ? null : (
                  <span className={styles.todayPill} style={{ left: axis.todayOffset }}>
                    {formatProjectDay(now)}
                  </span>
                )}
              </div>
              {options.timeline.showWeekNumbers ? (
                <div className={cn(styles.weekRow, 'h-5')}>
                  {axis.weeks.map((week) => (
                    <div
                      className={styles.weekCell}
                      key={week.key}
                      style={{ left: week.offset, width: week.width }}
                    >
                      {week.week}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {groups.map((group) => (
              <div key={group.key}>
                {group.key === 'all' ? null : (
                  <div className={cn(styles.groupRow, 'h-8')}>
                    <span className={styles.groupLabel}>{groupLabel(group.key)}</span>
                  </div>
                )}
                {group.items.map((project) => (
                  <TimelineRow
                    key={project.id}
                    leadAvatar={leadAvatar}
                    leadName={leadName}
                    now={now}
                    project={project}
                    range={range}
                    showLead={options.properties.lead}
                    showMilestones={options.properties.milestones}
                  />
                ))}
              </div>
            ))}
            {axis.todayOffset === null ? null : (
              <>
                <span
                  className={styles.todayColumn}
                  style={{
                    left:
                      axis.todayOffset -
                      ((now.hour() * 60 + now.minute()) / 1440) * TIMELINE_DAY_WIDTH,
                  }}
                />
                <span className={styles.todayLine} style={{ left: axis.todayOffset }} />
              </>
            )}
          </div>
        </div>
        {showProjectList ? null : <div className={styles.controlsOverlay}>{controls}</div>}
      </div>
    );
  },
);

ProjectTimeline.displayName = 'ProjectTimeline';

export default ProjectTimeline;
