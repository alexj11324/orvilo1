'use client';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  ChartGanttIcon,
  LayoutListIcon,
  Settings2Icon,
  SquareKanbanIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
  <div className="flex flex-row" style={{ alignItems: 'center', gap: 8 }}>
    <span className={styles.optionLabel}>{label}</span>
    <div className="flex flex-row" style={{ alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
      {children}
    </div>
  </div>
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
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={t('list.display.options')}
            size="icon-sm"
            title={t('list.display.options')}
            variant="ghost"
          >
            {createElement(Settings2Icon, { 'size': 16, 'aria-hidden': true })}
          </Button>
        }
      />
      <PopoverContent align="end" side="bottom">
        {
          <div className={cn('flex flex-col', styles.panel)} style={{ gap: 10 }}>
            <Tabs
              value={options.layout}
              onValueChange={(value) => {
                if (value === 'list' || value === 'board' || value === 'timeline')
                  onChange({ layout: value });
              }}
            >
              <TabsList className="w-full">
                {[
                  {
                    icon: <LayoutListIcon size={14} />,
                    label: t('list.display.layout.list'),
                    value: 'list',
                  },
                  {
                    icon: <SquareKanbanIcon size={14} />,
                    label: t('list.display.layout.board'),
                    value: 'board',
                  },
                  {
                    icon: <ChartGanttIcon size={14} />,
                    label: t('list.display.layout.timeline'),
                    value: 'timeline',
                  },
                ].map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.icon}
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {timelineLayout ? (
              <div className="flex flex-col" style={{ gap: 4 }}>
                <span className={styles.sectionTitle}>{t('list.display.timelineOptions')}</span>
                {(
                  [
                    ['showProjectList', t('list.display.showProjectList')],
                    ['showWeekNumbers', t('list.display.showWeekNumbers')],
                  ] as const
                ).map(([key, label]) => (
                  <div
                    className="flex flex-row"
                    key={key}
                    style={{ alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span className={styles.subTitle}>{label}</span>
                    <Switch
                      checked={options.timeline[key]}
                      size="sm"
                      onCheckedChange={(checked) =>
                        onChange({ timeline: { ...options.timeline, [key]: checked } })
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}
            <OptionRow label={t('list.display.grouping')}>
              {/* The board surface is a fixed status kanban; grouping applies
                  to the list layout only, so the control goes inert there. */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span style={{ display: 'flex', flex: 1, minWidth: 0 }}>
                      <Select
                        disabled={options.layout === 'board'}
                        value={options.grouping}
                        items={PROJECT_LIST_GROUPINGS.map((value) => ({
                          label: t(`list.display.grouping.${value}`),
                          value,
                        }))}
                        onValueChange={(value) =>
                          onChange({ grouping: value as ProjectListDisplayOptions['grouping'] })
                        }
                      >
                        <SelectTrigger size="sm" style={{ flex: 1, minWidth: 0 }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROJECT_LIST_GROUPINGS.map((value) => ({
                            label: t(`list.display.grouping.${value}`),
                            value,
                          })).map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </span>
                  }
                />
                <TooltipContent>
                  {options.layout === 'board' ? t('list.display.groupingBoardHint') : undefined}
                </TooltipContent>
              </Tooltip>
            </OptionRow>
            <OptionRow label={t('list.display.ordering')}>
              <Select
                value={options.orderBy}
                items={[
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
                onValueChange={(value) =>
                  onChange({
                    orderBy: value as ProjectListDisplayOptions['orderBy'],
                    orderDirection: defaultDirectionForOrdering(
                      value as ProjectListDisplayOptions['orderBy'],
                    ),
                  })
                }
              >
                <SelectTrigger size="sm" style={{ flex: 1, minWidth: 0 }}>
                  <SelectValue>
                    {options.orderBy === 'name'
                      ? options.orderDirection === 'desc'
                        ? 'Z–A'
                        : 'A–Z'
                      : t(`list.display.ordering.${options.orderBy}`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[
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
                  ].map((option) => (
                    <SelectItem
                      disabled={'disabled' in option && option.disabled === true}
                      hidden={'style' in option && Boolean(option.style)}
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span style={{ display: 'inline-flex' }}>
                      <Button
                        aria-label={t('list.display.reverseOrder')}
                        disabled={options.orderBy === 'manual'}
                        size="icon-sm"
                        variant="ghost"
                        onClick={() =>
                          onChange({
                            orderDirection: options.orderDirection === 'asc' ? 'desc' : 'asc',
                          })
                        }
                      >
                        {createElement(
                          options.orderDirection === 'asc'
                            ? ArrowUpNarrowWideIcon
                            : ArrowDownWideNarrowIcon,
                          { 'size': 16, 'aria-hidden': true },
                        )}
                      </Button>
                    </span>
                  }
                />
                <TooltipContent>{t('list.display.reverseOrder')}</TooltipContent>
              </Tooltip>
            </OptionRow>
            <OptionRow label={t('list.display.showClosed')}>
              <Select
                value={options.showClosed}
                items={PROJECT_LIST_CLOSED_WINDOWS.map((value) => ({
                  label: t(`list.display.closed.${value}`),
                  value,
                }))}
                onValueChange={(value) =>
                  onChange({ showClosed: value as ProjectListClosedWindow })
                }
              >
                <SelectTrigger size="sm" style={{ flex: 1, minWidth: 0 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_LIST_CLOSED_WINDOWS.map((value) => ({
                    label: t(`list.display.closed.${value}`),
                    value,
                  })).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </OptionRow>
            <div className="flex flex-col" style={{ gap: 4 }}>
              <span className={styles.sectionTitle}>
                {timelineLayout ? t('list.display.properties') : t('list.display.listOptions')}
              </span>
              {timelineLayout ? null : (
                <span className={styles.subTitle}>{t('list.display.properties')}</span>
              )}
            </div>
            <div className="flex flex-row" style={{ gap: 6, flexWrap: 'wrap' }}>
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
                    <Tooltip key={property}>
                      <TooltipTrigger
                        render={<span style={{ display: 'inline-flex' }}>{chip}</span>}
                      />
                      <TooltipContent>{t('list.display.propertyUnavailable')}</TooltipContent>
                    </Tooltip>
                  );
                },
              )}
            </div>
            <div
              className="flex flex-row"
              style={{ alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Button size="sm" variant="ghost" onClick={onReset}>
                {t('list.display.reset')}
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span style={{ display: 'inline-flex' }}>
                      <Button disabled={true} size="sm" variant="outline">
                        {t('list.display.setDefault')}
                      </Button>
                    </span>
                  }
                />
                <TooltipContent>{t('list.display.setDefaultUnavailable')}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        }
      </PopoverContent>
    </Popover>
  );
});

DisplayOptionsPopover.displayName = 'DisplayOptionsPopover';

export default DisplayOptionsPopover;
