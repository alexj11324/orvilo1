'use client';

import { Icon, Tooltip } from '@lobehub/ui';
import { Button, Select, Text } from '@lobehub/ui/base-ui';
import type { ProjectHealth } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs, { type Dayjs } from 'dayjs';
import type { ReactNode } from 'react';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { PROJECT_STATUS_VISUALS, resolveProjectStatus } from '@/components/ExecutionStatus';
import { PriorityIcon, resolvePriorityLevel } from '@/components/PriorityIcon';
import { PROJECT_HEALTH_META, ProjectHealthIcon } from '@/features/Projects/healthMeta';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { ProjectActiveStatusIcon } from '@/features/Projects/ProjectActiveStatusIcon';
import { ProjectIcon } from '@/features/Projects/ProjectIcon';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useProjectStore } from '@/store/project';
import type { ProjectListItem } from '@/store/project/store';

import { useProjectDateFormatter } from '../useProjectDateFormatter';
import type { ProjectListDisplayOptions, ProjectListGroup } from './displayOptions';
import {
  buildTimelineAxis,
  clusterTimelineMilestones,
  resolveTimelineRange,
  TIMELINE_DAY_WIDTH,
  TIMELINE_GROUP_ROW_HEIGHT,
  TIMELINE_LIST_WIDTH,
  TIMELINE_MONTH_ROW_HEIGHT,
  TIMELINE_ROW_HEIGHT,
  TIMELINE_WEEK_ROW_HEIGHT,
  timelineBarRect,
  timelinePlaceholderRect,
  type TimelineRange,
} from './timelineGeometry';

const styles = createStaticStyles(({ css }) => ({
  axisContent: css`
    position: relative;
    min-width: 100%;
  `,
  axisScroll: css`
    overflow-x: auto;
    overscroll-behavior: contain;
    flex: 1;
    min-width: 0;
  `,
  bar: css`
    position: absolute;
    inset-block-start: 50%;
    transform: translateY(-50%);

    overflow: hidden;
    display: block;

    height: 10px;
    border-radius: 5px;
  `,
  barFill: css`
    display: block;
    height: 100%;
    border-radius: inherit;
  `,
  cellIcons: css`
    position: relative;
    z-index: 1;

    display: flex;
    flex: none;
    gap: 6px;
    align-items: center;

    color: ${cssVar.colorTextTertiary};
  `,
  controls: css`
    display: flex;
    flex: none;
    gap: 6px;
    align-items: center;
  `,
  controlsOverlay: css`
    position: absolute;
    z-index: 3;
    inset-block-start: 4px;
    inset-inline-end: 8px;

    padding: 2px;
    border-radius: 6px;

    background: ${cssVar.colorBgContainer};
    box-shadow: ${cssVar.boxShadowSecondary};
  `,
  groupLabel: css`
    position: sticky;
    inset-inline-start: 0;

    display: inline-flex;
    gap: 8px;
    align-items: center;

    padding-inline: 12px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;
  `,
  groupRow: css`
    display: flex;
    align-items: center;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorFillQuaternary};
  `,
  listCell: css`
    position: relative;

    display: flex;
    gap: 8px;
    align-items: center;

    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  listColumn: css`
    flex: none;
    width: ${TIMELINE_LIST_WIDTH}px;
    border-inline-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  listHeader: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;

    padding-inline: 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  monthCell: css`
    position: absolute;
    inset-block: 0;

    display: flex;
    align-items: center;

    padding-inline: 8px;
    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 11px;
    font-weight: 500;
    color: ${cssVar.colorTextTertiary};
    white-space: nowrap;
  `,
  monthGridline: css`
    pointer-events: none;

    position: absolute;
    inset-block: 0;

    width: 1px;

    background: ${cssVar.colorBorderSecondary};
  `,
  monthRow: css`
    position: relative;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  overlayMark: css`
    position: absolute;
    z-index: 2;
    inset-block-start: 50%;
    transform: translate(-50%, -50%);

    display: inline-flex;
    gap: 2px;
    align-items: center;

    font-size: 10px;
    line-height: 1;
    color: ${cssVar.colorTextSecondary};
  `,
  placeholderBar: css`
    position: absolute;
    inset-block-start: 50%;
    transform: translateY(-50%);

    display: flex;
    align-items: center;
    justify-content: center;

    height: 16px;
    border: 1px dashed ${cssVar.colorBorder};
    border-radius: 8px;

    font-size: 10px;
    color: ${cssVar.colorTextQuaternary};
    white-space: nowrap;
  `,
  row: css`
    position: relative;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  rowLink: css`
    position: absolute;
    inset: 0;
    border-radius: inherit;
    color: inherit;
  `,
  timeline: css`
    position: relative;
    display: flex;
    align-items: flex-start;
    min-width: 0;
  `,
  todayColumn: css`
    pointer-events: none;

    position: absolute;
    inset-block: 0;

    width: ${TIMELINE_DAY_WIDTH}px;

    opacity: 0.08;
    background: ${cssVar.colorPrimary};
  `,
  todayLine: css`
    pointer-events: none;

    position: absolute;
    inset-block: 0;

    width: 1px;

    background: ${cssVar.colorPrimary};
  `,
  todayPill: css`
    pointer-events: none;

    position: absolute;
    z-index: 2;
    inset-block-start: 3px;
    transform: translateX(-50%);

    padding-block: 1px;
    padding-inline: 5px;
    border-radius: 999px;

    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
    color: ${cssVar.colorWhite};
    white-space: nowrap;

    background: ${cssVar.colorPrimary};
  `,
  weekCell: css`
    position: absolute;
    inset-block: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 10px;
    color: ${cssVar.colorTextQuaternary};
  `,
  weekRow: css`
    position: relative;
    background: ${cssVar.colorFillQuaternary};
  `,
}));

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
    <Tooltip title={label}>
      <span aria-label={label} role="img">
        <ProjectHealthIcon health={valid} size={12} />
      </span>
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
    const formatDate = useProjectDateFormatter();
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
      project.startDate ? formatDate(project.startDate) : null,
      project.targetDate ? formatDate(project.targetDate) : null,
    ]
      .filter(Boolean)
      .join(' → ');

    return (
      <div className={styles.row} style={{ height: TIMELINE_ROW_HEIGHT }}>
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

    const headerHeight =
      TIMELINE_MONTH_ROW_HEIGHT + (options.timeline.showWeekNumbers ? TIMELINE_WEEK_ROW_HEIGHT : 0);
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
          size="small"
          type="text"
          onClick={() => axis.todayOffset !== null && scrollToOffset(axis.todayOffset)}
        >
          {t('list.timeline.today')}
        </Button>
        <Select
          aria-label={t('list.timeline.yearJump')}
          defaultValue={now.year()}
          options={axis.years.map((year) => ({ label: String(year), value: year }))}
          size="small"
          style={{ width: 84 }}
          onChange={(value) => {
            if (typeof value !== 'number') return;
            const january = dayjs().year(value).startOf('year');
            scrollToOffset(january.diff(range.start, 'day') * TIMELINE_DAY_WIDTH);
          }}
        />
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
                {group.key === 'all' ? null : (
                  <div className={styles.groupRow} style={{ height: TIMELINE_GROUP_ROW_HEIGHT }} />
                )}
                {group.items.map((project) => {
                  const status = resolveProjectStatus(project.status);
                  const statusVisual = PROJECT_STATUS_VISUALS[status];
                  const priority = resolvePriorityLevel(project.priority);
                  const progress = projectProgress(project);
                  const lead = project.leadUserId;
                  const leadDisplayName = lead ? (leadName(lead) ?? lead) : undefined;
                  return (
                    <div
                      className={styles.listCell}
                      key={project.id}
                      style={{ height: TIMELINE_ROW_HEIGHT }}
                    >
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
                        <ProjectIcon color={cssVar.colorTextTertiary} size={16} />
                      )}
                      {options.properties.id ? (
                        <Text fontSize={11} type="secondary">
                          {project.identifier}
                        </Text>
                      ) : null}
                      <Text ellipsis fontSize={13} style={{ flex: 1, minWidth: 0 }} weight={500}>
                        {project.name}
                      </Text>
                      <span className={styles.cellIcons}>
                        {options.properties.status ? (
                          status === 'active' ? (
                            <ProjectActiveStatusIcon
                              color={statusVisual.color}
                              percent={progress ?? 0}
                            />
                          ) : (
                            <Icon
                              aria-label={t(`status.${status}`)}
                              color={statusVisual.color}
                              icon={statusVisual.icon}
                              size={14}
                            />
                          )
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
            <div style={{ height: headerHeight, position: 'relative' }}>
              <div className={styles.monthRow} style={{ height: TIMELINE_MONTH_ROW_HEIGHT }}>
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
                    {now.format('MMM D')}
                  </span>
                )}
              </div>
              {options.timeline.showWeekNumbers ? (
                <div className={styles.weekRow} style={{ height: TIMELINE_WEEK_ROW_HEIGHT }}>
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
                  <div className={styles.groupRow} style={{ height: TIMELINE_GROUP_ROW_HEIGHT }}>
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
