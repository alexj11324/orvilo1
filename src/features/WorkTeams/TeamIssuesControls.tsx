'use client';
import type { WorkQueryLayout } from '@orvilo/types';
import { cn } from 'cn';
import { FilterIcon, PanelRightCloseIcon, PanelRightOpenIcon, Settings2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { BuilderState } from '@/features/SavedViews/workQueryBuilder';
import WorkQueryFilterBuilder from '@/features/SavedViews/WorkQueryFilterBuilder';

import type {
  TeamIssuesBoardGrouping,
  TeamIssuesBoardLane,
  TeamIssuesCompletedWindow,
  TeamIssuesDisplay,
  TeamIssuesListGrouping,
  TeamIssuesOrdering,
} from './teamIssuesDisplay';
import {
  TEAM_ISSUES_BOARD_GROUPINGS,
  TEAM_ISSUES_BOARD_LANES,
  TEAM_ISSUES_COMPLETED_WINDOWS,
  TEAM_ISSUES_LIST_GROUPINGS,
  TEAM_ISSUES_ORDERINGS,
  teamIssuesBoardLane,
} from './teamIssuesDisplay';
import { ALL_TEAM_CYCLES } from './teamWorkQuery';

const styles = {
  controlPopover: 'w-[min(420px,calc(100vw-32px))] p-3',
  optionLabel: 'flex-none w-24 text-[13px] text-muted-foreground',
  sectionLabel: '[padding-block-start:4px] text-[12px] font-medium text-muted-foreground',
};

const OptionRow = memo<{ children: ReactNode; label: string }>(({ children, label }) => (
  <div className="flex min-h-10 flex-row items-center gap-2">
    <span className={styles.optionLabel}>{label}</span>
    <div className="flex flex-col flex-1 min-w-0">{children}</div>
  </div>
));

OptionRow.displayName = 'OptionRow';

interface TeamIssuesControlsProps {
  /** Applied builder predicates — paints the Filter icon's active state. */
  activeFilterCount: number;
  builder: BuilderState;
  cycleId: string;
  cycleOptions: { label: string; value: string }[];
  /** Board mode can't arm the peek — the kanban's cards own their clicks. */
  detailsDisabled: boolean;
  /**
   * Resolved pane visibility — `aria-expanded` reports the pane, not the
   * armed toggle: with nothing selected, expanded stays false.
   */
  detailsExpanded: boolean;
  detailsOpen: boolean;
  display: TeamIssuesDisplay;
  layout: WorkQueryLayout;
  noProject: boolean;
  onBuilderChange: (builder: BuilderState) => void;
  onCycleChange: (cycleId: string) => void;
  onDisplayChange: (patch: Partial<TeamIssuesDisplay>) => void;
  onLayoutChange: (layout: WorkQueryLayout) => void;
  onNoProjectChange: (checked: boolean) => void;
  onResetDisplay: () => void;
  onResetFilters: () => void;
  onToggleDetails: () => void;
}

/**
 * The Linear team-issues chrome: Add filter, Display options, Open details.
 * The cycle picker and `No project` ride inside Filter (both are filter
 * dimensions); the layout switch lives inside Display options like the
 * reference panel instead of a standalone segmented control.
 */
const TeamIssuesControls = memo<TeamIssuesControlsProps>(
  ({
    activeFilterCount,
    builder,
    cycleId,
    cycleOptions,
    detailsDisabled,
    detailsExpanded,
    detailsOpen,
    display,
    layout,
    noProject,
    onBuilderChange,
    onCycleChange,
    onDisplayChange,
    onLayoutChange,
    onNoProjectChange,
    onResetDisplay,
    onResetFilters,
    onToggleDetails,
  }) => {
    const { t } = useTranslation('common');

    const groupingOptions: readonly (TeamIssuesBoardGrouping | TeamIssuesListGrouping)[] =
      layout === 'board' ? TEAM_ISSUES_BOARD_GROUPINGS : TEAM_ISSUES_LIST_GROUPINGS;
    const groupingLabel = (value: string): string => {
      switch (value) {
        case 'assignee': {
          return t('myWork.grouping.assignee');
        }
        case 'cycle': {
          return t('teams.cycle');
        }
        case 'priority': {
          return t('myWork.grouping.priority');
        }
        case 'project': {
          return t('myWork.grouping.project');
        }
        default: {
          return t(`savedViews.groupBy.${value}` as never);
        }
      }
    };

    const layoutItems = [
      { label: t('teams.layoutList'), value: 'list' },
      { label: t('teams.layoutBoard'), value: 'board' },
    ];
    const groupingItems = groupingOptions.map((value) => ({
      label: groupingLabel(value),
      value,
    }));
    const laneOptions = TEAM_ISSUES_BOARD_LANES.filter(
      (lane) => lane === 'none' || teamIssuesBoardLane(display.boardGrouping, lane) === lane,
    );
    const laneItems = laneOptions.map((value) => ({
      label: groupingLabel(value),
      value,
    }));
    const orderingItems = TEAM_ISSUES_ORDERINGS.map((value) => ({
      label:
        value === 'default' ? t('savedViews.sortDefault') : t(`myWork.ordering.${value}` as never),
      value,
    }));
    const completedItems = TEAM_ISSUES_COMPLETED_WINDOWS.map((value) => ({
      label: t(`myWork.completed.${value}` as never),
      value,
    }));

    return (
      <div className="flex flex-row items-center shrink-0" style={{ gap: 6 }}>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                aria-label={t('myWork.addFilter')}
                aria-pressed={activeFilterCount > 0 || noProject || cycleId !== ALL_TEAM_CYCLES}
                size="icon"
                title={t('myWork.addFilter')}
                variant={
                  activeFilterCount > 0 || noProject || cycleId !== ALL_TEAM_CYCLES
                    ? 'secondary'
                    : 'ghost'
                }
              >
                <FilterIcon aria-hidden className="size-4" />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)]">
            <div className={cn('flex flex-col gap-3', styles.controlPopover)}>
              <div className="flex flex-col gap-2">
                {cycleOptions.length > 1 ? (
                  <OptionRow label={t('teams.cycle')}>
                    <Select
                      items={cycleOptions}
                      value={cycleId}
                      onValueChange={(next) => {
                        if (typeof next === 'string') onCycleChange(next);
                      }}
                    >
                      <SelectTrigger aria-label={t('teams.cycle')} style={{ minWidth: 160 }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {cycleOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </OptionRow>
                ) : null}
                <label className="flex min-h-10 items-center gap-3 ps-3">
                  <Checkbox checked={noProject} onCheckedChange={onNoProjectChange} />
                  {t('teams.noProject')}
                </label>
              </div>
              <WorkQueryFilterBuilder
                entityType={'task'}
                value={builder}
                onChange={onBuilderChange}
              />
              {activeFilterCount > 0 ? (
                <div className="flex flex-row justify-end">
                  <Button variant="ghost" onClick={onResetFilters}>
                    {t('myWork.filtersReset')}
                  </Button>
                </div>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                aria-label={t('savedViews.displayOptions')}
                size="icon"
                title={t('savedViews.displayOptions')}
                variant="ghost"
              >
                <Settings2Icon aria-hidden className="size-4" />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)]">
            <div className={cn('flex flex-col gap-3', styles.controlPopover)}>
              <OptionRow label={t('myWork.displayLayout')}>
                <Select
                  items={layoutItems}
                  value={layout}
                  onValueChange={(next) => {
                    if (next === 'board' || next === 'list') onLayoutChange(next);
                  }}
                >
                  <SelectTrigger aria-label={t('myWork.displayLayout')} style={{ minWidth: 140 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {layoutItems.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </OptionRow>
              <OptionRow label={t('savedViews.grouping')}>
                <Select
                  items={groupingItems}
                  value={layout === 'board' ? display.boardGrouping : display.grouping}
                  onValueChange={(next) => {
                    if (layout === 'board') {
                      if (
                        (TEAM_ISSUES_BOARD_GROUPINGS as readonly string[]).includes(next as string)
                      ) {
                        const boardGrouping = next as TeamIssuesBoardGrouping;
                        onDisplayChange({
                          boardGrouping,
                          boardLane: teamIssuesBoardLane(boardGrouping, display.boardLane),
                        });
                      }
                    } else if (
                      (TEAM_ISSUES_LIST_GROUPINGS as readonly string[]).includes(next as string)
                    ) {
                      onDisplayChange({ grouping: next as TeamIssuesListGrouping });
                    }
                  }}
                >
                  <SelectTrigger aria-label={t('savedViews.grouping')} style={{ minWidth: 150 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {groupingItems.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </OptionRow>
              {layout === 'board' ? (
                <OptionRow label={t('myWork.subGrouping')}>
                  <Select
                    items={laneItems}
                    value={teamIssuesBoardLane(display.boardGrouping, display.boardLane)}
                    onValueChange={(next) => {
                      if ((TEAM_ISSUES_BOARD_LANES as readonly string[]).includes(next as string)) {
                        onDisplayChange({ boardLane: next as TeamIssuesBoardLane });
                      }
                    }}
                  >
                    <SelectTrigger aria-label={t('myWork.subGrouping')} style={{ minWidth: 150 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {laneItems.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </OptionRow>
              ) : null}
              <OptionRow label={t('savedViews.ordering')}>
                <Select
                  items={orderingItems}
                  value={display.ordering}
                  onValueChange={(next) => {
                    if ((TEAM_ISSUES_ORDERINGS as readonly string[]).includes(next as string)) {
                      onDisplayChange({ ordering: next as TeamIssuesOrdering });
                    }
                  }}
                >
                  <SelectTrigger aria-label={t('savedViews.ordering')} style={{ minWidth: 170 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderingItems.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </OptionRow>
              <OptionRow label={t('myWork.completedIssues')}>
                <Select
                  items={completedItems}
                  value={display.completed}
                  onValueChange={(next) => {
                    if (
                      (TEAM_ISSUES_COMPLETED_WINDOWS as readonly string[]).includes(next as string)
                    ) {
                      onDisplayChange({ completed: next as TeamIssuesCompletedWindow });
                    }
                  }}
                >
                  <SelectTrigger aria-label={t('myWork.completedIssues')} style={{ minWidth: 140 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {completedItems.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </OptionRow>
              <OptionRow label={t('myWork.showSubIssues')}>
                <Switch
                  aria-label={t('myWork.showSubIssues')}
                  checked={display.showSubIssues}
                  onCheckedChange={(checked) => onDisplayChange({ showSubIssues: checked })}
                />
              </OptionRow>
              <OptionRow label={t('myWork.nestedSubIssues')}>
                <Switch
                  aria-label={t('myWork.nestedSubIssues')}
                  checked={display.nestedSubIssues}
                  disabled={!display.showSubIssues}
                  onCheckedChange={(checked) => onDisplayChange({ nestedSubIssues: checked })}
                />
              </OptionRow>
              {layout === 'board' ? (
                <OptionRow label={t('teams.showEmptyColumns')}>
                  <Switch
                    aria-label={t('teams.showEmptyColumns')}
                    checked={display.showEmptyColumns}
                    onCheckedChange={(checked) => onDisplayChange({ showEmptyColumns: checked })}
                  />
                </OptionRow>
              ) : null}
              {/* The one row property this surface controls — the rest of the
                  issue row is the shared AgentTaskItem's fixed anatomy. */}
              <span className={styles.sectionLabel}>{t('savedViews.displayProperties')}</span>
              <OptionRow label={t('savedViews.fields.projectId')}>
                <Switch
                  aria-label={t('savedViews.fields.projectId')}
                  checked={display.projectChip}
                  onCheckedChange={(checked) => onDisplayChange({ projectChip: checked })}
                />
              </OptionRow>
              <div className="flex flex-row justify-end">
                <Button variant="ghost" onClick={onResetDisplay}>
                  {t('myWork.filtersReset')}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          aria-expanded={detailsExpanded}
          aria-label={t(detailsOpen ? 'myWork.closeDetails' : 'myWork.openDetails')}
          disabled={detailsDisabled}
          size="icon"
          title={t(detailsOpen ? 'myWork.closeDetails' : 'myWork.openDetails')}
          variant="ghost"
          onClick={onToggleDetails}
        >
          {createElement(detailsOpen ? PanelRightCloseIcon : PanelRightOpenIcon, {
            'aria-hidden': true,
            'className': 'size-4',
          })}
        </Button>
      </div>
    );
  },
);

TeamIssuesControls.displayName = 'TeamIssuesControls';

export default TeamIssuesControls;
