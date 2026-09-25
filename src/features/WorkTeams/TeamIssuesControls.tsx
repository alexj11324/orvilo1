'use client';

import { Flexbox } from '@lobehub/ui';
import { ActionIcon, Button, Checkbox, Popover, Select, Switch } from '@lobehub/ui/base-ui';
import type { WorkQueryLayout } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { FilterIcon, PanelRightCloseIcon, PanelRightOpenIcon, Settings2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { BuilderState } from '@/features/SavedViews/workQueryBuilder';
import WorkQueryFilterBuilder from '@/features/SavedViews/WorkQueryFilterBuilder';

import type {
  TeamIssuesBoardGrouping,
  TeamIssuesCompletedWindow,
  TeamIssuesDisplay,
  TeamIssuesListGrouping,
  TeamIssuesOrdering,
} from './teamIssuesDisplay';
import {
  TEAM_ISSUES_BOARD_GROUPINGS,
  TEAM_ISSUES_COMPLETED_WINDOWS,
  TEAM_ISSUES_LIST_GROUPINGS,
  TEAM_ISSUES_ORDERINGS,
} from './teamIssuesDisplay';
import { ALL_TEAM_CYCLES } from './teamWorkQuery';

const styles = createStaticStyles(({ css }) => ({
  // Same popover width contract as the saved-view editors.
  controlPopover: css`
    width: min(420px, calc(100vw - 32px));
    padding: 12px;
  `,
  optionLabel: css`
    flex: none;
    width: 96px;
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  sectionLabel: css`
    padding-block-start: 4px;
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
  `,
}));

const OptionRow = memo<{ children: ReactNode; label: string }>(({ children, label }) => (
  <Flexbox horizontal align="center" gap={8}>
    <span className={styles.optionLabel}>{label}</span>
    <Flexbox flex={1} style={{ minWidth: 0 }}>
      {children}
    </Flexbox>
  </Flexbox>
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

    return (
      <Flexbox horizontal align="center" gap={6} style={{ flex: 'none' }}>
        <Popover
          placement="bottomRight"
          trigger="click"
          content={
            <Flexbox className={styles.controlPopover} gap={12}>
              <Flexbox gap={8}>
                {cycleOptions.length > 1 ? (
                  <OptionRow label={t('teams.cycle')}>
                    <Select
                      aria-label={t('teams.cycle')}
                      options={cycleOptions}
                      size="small"
                      style={{ minWidth: 160 }}
                      value={cycleId}
                      onChange={(next) => {
                        if (typeof next === 'string') onCycleChange(next);
                      }}
                    />
                  </OptionRow>
                ) : null}
                <Checkbox checked={noProject} onChange={onNoProjectChange}>
                  {t('teams.noProject')}
                </Checkbox>
              </Flexbox>
              <WorkQueryFilterBuilder
                entityType={'task'}
                value={builder}
                onChange={onBuilderChange}
              />
              {activeFilterCount > 0 ? (
                <Flexbox horizontal justify="flex-end">
                  <Button size="small" type="text" onClick={onResetFilters}>
                    {t('myWork.filtersReset')}
                  </Button>
                </Flexbox>
              ) : null}
            </Flexbox>
          }
        >
          <ActionIcon
            active={activeFilterCount > 0 || noProject || cycleId !== ALL_TEAM_CYCLES}
            aria-label={t('myWork.addFilter')}
            icon={FilterIcon}
            size="small"
            title={t('myWork.addFilter')}
          />
        </Popover>
        <Popover
          placement="bottomRight"
          trigger="click"
          content={
            <Flexbox className={styles.controlPopover} gap={12}>
              <OptionRow label={t('myWork.displayLayout')}>
                <Select
                  size="small"
                  style={{ minWidth: 140 }}
                  value={layout}
                  options={[
                    { label: t('teams.layoutList'), value: 'list' },
                    { label: t('teams.layoutBoard'), value: 'board' },
                  ]}
                  onChange={(next) => {
                    if (next === 'board' || next === 'list') onLayoutChange(next);
                  }}
                />
              </OptionRow>
              <OptionRow label={t('savedViews.grouping')}>
                <Select
                  size="small"
                  style={{ minWidth: 150 }}
                  value={layout === 'board' ? display.boardGrouping : display.grouping}
                  options={groupingOptions.map((value) => ({
                    label: groupingLabel(value),
                    value,
                  }))}
                  onChange={(next) => {
                    if (layout === 'board') {
                      if (
                        (TEAM_ISSUES_BOARD_GROUPINGS as readonly string[]).includes(next as string)
                      ) {
                        onDisplayChange({ boardGrouping: next as TeamIssuesBoardGrouping });
                      }
                    } else if (
                      (TEAM_ISSUES_LIST_GROUPINGS as readonly string[]).includes(next as string)
                    ) {
                      onDisplayChange({ grouping: next as TeamIssuesListGrouping });
                    }
                  }}
                />
              </OptionRow>
              <OptionRow label={t('savedViews.ordering')}>
                <Select
                  size="small"
                  style={{ minWidth: 170 }}
                  value={display.ordering}
                  options={TEAM_ISSUES_ORDERINGS.map((value) => ({
                    label:
                      value === 'default'
                        ? t('savedViews.sortDefault')
                        : t(`myWork.ordering.${value}` as never),
                    value,
                  }))}
                  onChange={(next) => {
                    if ((TEAM_ISSUES_ORDERINGS as readonly string[]).includes(next as string)) {
                      onDisplayChange({ ordering: next as TeamIssuesOrdering });
                    }
                  }}
                />
              </OptionRow>
              <OptionRow label={t('myWork.completedIssues')}>
                <Select
                  size="small"
                  style={{ minWidth: 140 }}
                  value={display.completed}
                  options={TEAM_ISSUES_COMPLETED_WINDOWS.map((value) => ({
                    label: t(`myWork.completed.${value}` as never),
                    value,
                  }))}
                  onChange={(next) => {
                    if (
                      (TEAM_ISSUES_COMPLETED_WINDOWS as readonly string[]).includes(next as string)
                    ) {
                      onDisplayChange({ completed: next as TeamIssuesCompletedWindow });
                    }
                  }}
                />
              </OptionRow>
              <OptionRow label={t('myWork.showSubIssues')}>
                <Switch
                  checked={display.showSubIssues}
                  size="small"
                  onChange={(checked) => onDisplayChange({ showSubIssues: checked })}
                />
              </OptionRow>
              <OptionRow label={t('myWork.nestedSubIssues')}>
                <Switch
                  checked={display.nestedSubIssues}
                  disabled={!display.showSubIssues}
                  size="small"
                  onChange={(checked) => onDisplayChange({ nestedSubIssues: checked })}
                />
              </OptionRow>
              {layout === 'board' ? (
                <OptionRow label={t('teams.showEmptyColumns')}>
                  <Switch
                    checked={display.showEmptyColumns}
                    size="small"
                    onChange={(checked) => onDisplayChange({ showEmptyColumns: checked })}
                  />
                </OptionRow>
              ) : null}
              {/* The one row property this surface controls — the rest of the
                  issue row is the shared AgentTaskItem's fixed anatomy. */}
              <span className={styles.sectionLabel}>{t('savedViews.displayProperties')}</span>
              <OptionRow label={t('savedViews.fields.projectId')}>
                <Switch
                  checked={display.projectChip}
                  size="small"
                  onChange={(checked) => onDisplayChange({ projectChip: checked })}
                />
              </OptionRow>
              <Flexbox horizontal justify="flex-end">
                <Button size="small" type="text" onClick={onResetDisplay}>
                  {t('myWork.filtersReset')}
                </Button>
              </Flexbox>
            </Flexbox>
          }
        >
          <ActionIcon
            aria-label={t('savedViews.displayOptions')}
            icon={Settings2Icon}
            size="small"
            title={t('savedViews.displayOptions')}
          />
        </Popover>
        <ActionIcon
          aria-expanded={detailsExpanded}
          aria-label={t(detailsOpen ? 'myWork.closeDetails' : 'myWork.openDetails')}
          disabled={detailsDisabled}
          icon={detailsOpen ? PanelRightCloseIcon : PanelRightOpenIcon}
          size="small"
          title={t(detailsOpen ? 'myWork.closeDetails' : 'myWork.openDetails')}
          onClick={onToggleDetails}
        />
      </Flexbox>
    );
  },
);

TeamIssuesControls.displayName = 'TeamIssuesControls';

export default TeamIssuesControls;
