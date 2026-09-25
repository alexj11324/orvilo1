'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import {
  ActionIcon,
  Button,
  Popover,
  Segmented,
  Select,
  Switch,
  Tooltip,
} from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  ChartGanttIcon,
  LayoutListIcon,
  Settings2Icon,
  SquareKanbanIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  defaultDirectionForOrdering,
  isDataBackedProjectListProperty,
  PROJECT_LIST_CLOSED_WINDOWS,
  PROJECT_LIST_GROUPINGS,
  PROJECT_LIST_HEADER_ONLY_ORDERINGS,
  PROJECT_LIST_MENU_ORDERINGS,
  PROJECT_LIST_PROPERTIES,
  type ProjectListClosedWindow,
  type ProjectListDisplayOptions,
  type ProjectListOrdering,
  TIMELINE_PROJECT_LIST_PROPERTIES,
} from './displayOptions';

const styles = createStaticStyles(({ css }) => ({
  chip: css`
    cursor: pointer;

    flex: none;

    padding-block: 3px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 999px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;

    background: transparent;

    &:hover,
    &:focus-visible {
      border-color: ${cssVar.colorTextTertiary};
      color: ${cssVar.colorText};
    }
  `,
  chipActive: css`
    border-color: ${cssVar.colorTextTertiary};
    color: ${cssVar.colorText};
    background: ${cssVar.colorFillTertiary};
  `,
  chipDisabled: css`
    cursor: not-allowed;
    opacity: 0.4;

    &:hover,
    &:focus-visible {
      border-color: ${cssVar.colorBorder};
      color: ${cssVar.colorTextSecondary};
    }
  `,
  optionLabel: css`
    flex: none;
    width: 118px;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  panel: css`
    width: 302px;
    padding: 12px;
  `,
  sectionTitle: css`
    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  subTitle: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

const OptionRow = memo<{ children: ReactNode; label: string }>(({ children, label }) => (
  <Flexbox horizontal align="center" gap={8}>
    <span className={styles.optionLabel}>{label}</span>
    <Flexbox horizontal align="center" flex={1} gap={4} style={{ minWidth: 0 }}>
      {children}
    </Flexbox>
  </Flexbox>
));

OptionRow.displayName = 'OptionRow';

export interface DisplayOptionsPopoverProps {
  onChange: (patch: Partial<ProjectListDisplayOptions>) => void;
  onReset: () => void;
  options: ProjectListDisplayOptions;
}

/**
 * The Linear projects Display options panel (ref-projects-display-options.png,
 * NEW-FINDINGS §3): a 3-way layout segmented control, Grouping / Ordering /
 * Show closed projects selects, the Display-property chips, and a
 * Reset / Set default footer. Timeline layout swaps in the reference's
 * Timeline options (Show project list / Show week numbers) and its smaller
 * Display-properties subset.
 *
 * One honest degradation, documented in the task report: "Set default for
 * everyone" stays disabled — it writes a workspace-scope default on the
 * reference, and this app has no workspace-settings write path for display
 * options (options persist per user via SystemStatus).
 */
const DisplayOptionsPopover = memo<DisplayOptionsPopoverProps>(({ onChange, onReset, options }) => {
  const { t } = useTranslation('project');
  const timelineLayout = options.layout === 'timeline';

  return (
    <Popover
      placement="bottomRight"
      trigger="click"
      content={
        <Flexbox className={styles.panel} gap={10}>
          <Segmented
            block
            size="small"
            value={options.layout}
            options={[
              {
                icon: <Icon icon={LayoutListIcon} size={14} />,
                label: t('list.display.layout.list'),
                value: 'list',
              },
              {
                icon: <Icon icon={SquareKanbanIcon} size={14} />,
                label: t('list.display.layout.board'),
                value: 'board',
              },
              {
                icon: <Icon icon={ChartGanttIcon} size={14} />,
                label: t('list.display.layout.timeline'),
                value: 'timeline',
              },
            ]}
            onChange={(value) => {
              if (value === 'list' || value === 'board' || value === 'timeline')
                onChange({ layout: value });
            }}
          />
          {timelineLayout ? (
            <Flexbox gap={4}>
              <span className={styles.sectionTitle}>{t('list.display.timelineOptions')}</span>
              {(
                [
                  ['showProjectList', t('list.display.showProjectList')],
                  ['showWeekNumbers', t('list.display.showWeekNumbers')],
                ] as const
              ).map(([key, label]) => (
                <Flexbox horizontal align="center" justify="space-between" key={key}>
                  <span className={styles.subTitle}>{label}</span>
                  <Switch
                    checked={options.timeline[key]}
                    size="small"
                    onChange={(checked) =>
                      onChange({ timeline: { ...options.timeline, [key]: checked } })
                    }
                  />
                </Flexbox>
              ))}
            </Flexbox>
          ) : null}
          <OptionRow label={t('list.display.grouping')}>
            {/* The board surface is a fixed status kanban; grouping applies
                  to the list layout only, so the control goes inert there. */}
            <Tooltip
              title={options.layout === 'board' ? t('list.display.groupingBoardHint') : undefined}
            >
              {/* span keeps hover events flowing while the Select is disabled. */}
              <span style={{ display: 'flex', flex: 1, minWidth: 0 }}>
                <Select
                  disabled={options.layout === 'board'}
                  size="small"
                  style={{ flex: 1, minWidth: 0 }}
                  value={options.grouping}
                  options={PROJECT_LIST_GROUPINGS.map((value) => ({
                    label: t(`list.display.grouping.${value}`),
                    value,
                  }))}
                  onChange={(value) =>
                    onChange({ grouping: value as ProjectListDisplayOptions['grouping'] })
                  }
                />
              </span>
            </Tooltip>
          </OptionRow>
          <OptionRow label={t('list.display.ordering')}>
            <Select
              // The reference dropdown lists only the documented five; a
              // sortable header can still set a header-only ordering (name →
              // the reference's "A–Z"/"Z–A", health/targetDate → the field
              // label), which `labelRender` keeps legible instead of blanking.
              size="small"
              style={{ flex: 1, minWidth: 0 }}
              value={options.orderBy}
              labelRender={(option) =>
                option.value === 'name'
                  ? options.orderDirection === 'desc'
                    ? 'Z–A'
                    : 'A–Z'
                  : t(`list.display.ordering.${option.value as ProjectListOrdering}`)
              }
              options={[
                ...PROJECT_LIST_MENU_ORDERINGS.map((value) => ({
                  label: t(`list.display.ordering.${value}`),
                  value,
                })),
                // Header-only orderings stay resolvable so an active header
                // sort labels the trigger — but they render hidden+disabled:
                // the reference menu does not offer them as dropdown picks.
                ...PROJECT_LIST_HEADER_ONLY_ORDERINGS.map((value) => ({
                  disabled: true,
                  label: t(`list.display.ordering.${value}`),
                  style: { display: 'none' },
                  value,
                })),
              ]}
              onChange={(value) =>
                onChange({
                  orderBy: value as ProjectListDisplayOptions['orderBy'],
                  orderDirection: defaultDirectionForOrdering(
                    value as ProjectListDisplayOptions['orderBy'],
                  ),
                })
              }
            />
            <Tooltip title={t('list.display.reverseOrder')}>
              {/* span keeps hover events flowing while the button is disabled. */}
              <span style={{ display: 'inline-flex' }}>
                <ActionIcon
                  aria-label={t('list.display.reverseOrder')}
                  disabled={options.orderBy === 'manual'}
                  size="small"
                  icon={
                    options.orderDirection === 'asc'
                      ? ArrowUpNarrowWideIcon
                      : ArrowDownWideNarrowIcon
                  }
                  onClick={() =>
                    onChange({
                      orderDirection: options.orderDirection === 'asc' ? 'desc' : 'asc',
                    })
                  }
                />
              </span>
            </Tooltip>
          </OptionRow>
          <OptionRow label={t('list.display.showClosed')}>
            <Select
              size="small"
              style={{ flex: 1, minWidth: 0 }}
              value={options.showClosed}
              options={PROJECT_LIST_CLOSED_WINDOWS.map((value) => ({
                label: t(`list.display.closed.${value}`),
                value,
              }))}
              onChange={(value) => onChange({ showClosed: value as ProjectListClosedWindow })}
            />
          </OptionRow>
          <Flexbox gap={4}>
            <span className={styles.sectionTitle}>
              {timelineLayout ? t('list.display.properties') : t('list.display.listOptions')}
            </span>
            {timelineLayout ? null : (
              <span className={styles.subTitle}>{t('list.display.properties')}</span>
            )}
          </Flexbox>
          <Flexbox horizontal gap={6} wrap="wrap">
            {(timelineLayout ? TIMELINE_PROJECT_LIST_PROPERTIES : PROJECT_LIST_PROPERTIES).map(
              (property) => {
                const supported = isDataBackedProjectListProperty(property);
                const active = supported && options.properties[property];
                const chip = (
                  <button
                    aria-pressed={active}
                    disabled={!supported}
                    key={property}
                    type="button"
                    className={cx(
                      styles.chip,
                      active && styles.chipActive,
                      !supported && styles.chipDisabled,
                    )}
                    onClick={() =>
                      onChange({
                        properties: { ...options.properties, [property]: !active },
                      })
                    }
                  >
                    {t(`list.display.property.${property}`)}
                  </button>
                );
                return supported ? (
                  chip
                ) : (
                  <Tooltip key={property} title={t('list.display.propertyUnavailable')}>
                    {/* Tooltip needs a mouse-event-capable child — disabled buttons swallow them. */}
                    <span style={{ display: 'inline-flex' }}>{chip}</span>
                  </Tooltip>
                );
              },
            )}
          </Flexbox>
          <Flexbox horizontal align="center" justify="space-between">
            <Button size="small" type="text" onClick={onReset}>
              {t('list.display.reset')}
            </Button>
            <Tooltip title={t('list.display.setDefaultUnavailable')}>
              <span style={{ display: 'inline-flex' }}>
                <Button disabled size="small">
                  {t('list.display.setDefault')}
                </Button>
              </span>
            </Tooltip>
          </Flexbox>
        </Flexbox>
      }
    >
      <ActionIcon
        aria-label={t('list.display.options')}
        icon={Settings2Icon}
        size="small"
        title={t('list.display.options')}
      />
    </Popover>
  );
});

DisplayOptionsPopover.displayName = 'DisplayOptionsPopover';

export default DisplayOptionsPopover;
