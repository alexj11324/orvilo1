'use client';
import type { MyWorkMode, WorkQueryLayout } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import {
  BookmarkPlusIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  Settings2Icon,
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
import type { BuilderState } from '@/features/SavedViews/workQueryBuilder';

import {
  MY_WORK_BOARD_GROUPING_OPTIONS,
  MY_WORK_ROW_PROPERTIES,
  type MyWorkBoardGrouping,
  myWorkBoardSubGroupingOptions,
  type MyWorkCompletedWindow,
  type MyWorkDisplay,
  type MyWorkListGrouping,
  type MyWorkOrdering,
  myWorkOrderingDefaultKey,
  type MyWorkSubGrouping,
  myWorkSubGroupingOptions,
} from './myWorkDisplay';
import MyWorkFilterMenu from './MyWorkFilterMenu';

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
}));

const OptionRow = memo<{ children: ReactNode; label: string }>(({ children, label }) => (
  <div className="flex flex-row" style={{ alignItems: 'center', gap: 8 }}>
    <span className={styles.optionLabel}>{label}</span>
    <div className="flex flex-col" style={{ flex: 1, minWidth: 0 }}>
      {children}
    </div>
  </div>
));

OptionRow.displayName = 'OptionRow';

/** A display-property toggle — label left, switch right (Linear's list). */
const PropertyRow = memo<{
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}>(({ checked, label, onChange }) => (
  <div className="flex flex-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
    <span className="text-sm">{label}</span>
    <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
  </div>
));

PropertyRow.displayName = 'PropertyRow';

interface MyWorkControlsProps {
  /** Applied extra predicates — paints the Filter icon's active state. */
  activeFilterCount: number;
  boardGrouping: MyWorkBoardGrouping;
  builder: BuilderState;
  canBoard: boolean;
  canSaveAs: boolean;
  delegated: boolean;
  detailsDisabled?: boolean;
  /**
   * Resolved pane visibility — `aria-expanded` must report the pane, not the
   * armed toggle: with nothing selected, expanded stays false.
   */
  detailsExpanded: boolean;
  detailsOpen: boolean;
  display: MyWorkDisplay;
  /** Advanced builder is only expressible on the saveable modes. */
  filterSupported: boolean;
  groupingOptions: MyWorkListGrouping[];
  layout: WorkQueryLayout;
  mode: MyWorkMode;
  noProject: boolean;
  onBuilderChange: (builder: BuilderState) => void;
  onDelegatedChange: (checked: boolean) => void;
  onDisplayChange: (patch: Partial<MyWorkDisplay>) => void;
  onLayoutChange: (layout: WorkQueryLayout) => void;
  onNoProjectChange: (checked: boolean) => void;
  onResetFilters: () => void;
  onSaveAs: () => void;
  onToggleDetails: () => void;
  orderingOptions: MyWorkOrdering[];
  /** Project catalog for the filter directory's `projectId` picker. */
  projects: { id: string; name: string }[];
  /** Joined teams for the filter directory's `teamId` picker. */
  teamOptions: { id: string; name: string }[];
}

/**
 * The Linear My issues chrome: three icon entries — Add filter, Display
 * options, Open details. `No project`/`Delegated` keep their URL flags as
 * checkbox rows inside Filter; the layout switch moves into Display options.
 */
const MyWorkControls = memo<MyWorkControlsProps>(
  ({
    activeFilterCount,
    boardGrouping,
    builder,
    canBoard,
    canSaveAs,
    detailsDisabled,
    detailsExpanded,
    detailsOpen,
    display,
    delegated,
    filterSupported,
    groupingOptions,
    layout,
    mode,
    noProject,
    onBuilderChange,
    onDelegatedChange,
    onDisplayChange,
    onLayoutChange,
    onNoProjectChange,
    onResetFilters,
    onSaveAs,
    onToggleDetails,
    orderingOptions,
    projects,
    teamOptions,
  }) => {
    const { t } = useTranslation('common');

    const orderingLabel = (ordering: MyWorkOrdering): string =>
      ordering === 'default'
        ? t(myWorkOrderingDefaultKey(mode) as never)
        : t(`myWork.ordering.${ordering}` as never);

    /** Shared groupBy labels — the client-bucketed row fields live under `myWork.grouping`. */
    const groupingLabel = (value: string): string => {
      switch (value) {
        case 'activityDate': {
          return t('myWork.grouping.activityDate');
        }
        case 'assignee': {
          return t('myWork.grouping.assignee');
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
      <div className="flex flex-row" style={{ alignItems: 'center', gap: 6, flex: 'none' }}>
        <MyWorkFilterMenu
          activeFilterCount={activeFilterCount}
          builder={builder}
          delegated={delegated}
          filterSupported={filterSupported}
          noProject={noProject}
          projects={projects}
          teamOptions={teamOptions}
          onBuilderChange={onBuilderChange}
          onDelegatedChange={onDelegatedChange}
          onNoProjectChange={onNoProjectChange}
          onResetFilters={onResetFilters}
        />
        <Popover>
          <PopoverTrigger
            render={
              <Button
                aria-label={t('savedViews.displayOptions')}
                size="icon"
                title={t('savedViews.displayOptions')}
                variant="ghost"
              >
                {createElement(Settings2Icon, { className: 'size-4 shrink-0' })}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)]">
            {
              <div className={cn('flex flex-col', styles.controlPopover)} style={{ gap: 12 }}>
                {canBoard ? (
                  <OptionRow label={t('myWork.displayLayout')}>
                    <Select
                      value={layout}
                      items={[
                        { label: t('myWork.layoutList'), value: 'list' },
                        { label: t('myWork.layoutBoard'), value: 'board' },
                      ]}
                      onValueChange={(next) => {
                        if (next === 'board' || next === 'list') onLayoutChange(next);
                      }}
                    >
                      <SelectTrigger aria-label={t('myWork.displayLayout')} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          { label: t('myWork.layoutList'), value: 'list' },
                          { label: t('myWork.layoutBoard'), value: 'board' },
                        ].map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </OptionRow>
                ) : null}
                <OptionRow label={t('savedViews.grouping')}>
                  {layout === 'board' ? (
                    <Select
                      value={boardGrouping}
                      items={MY_WORK_BOARD_GROUPING_OPTIONS.map((value) => ({
                        label: groupingLabel(value),
                        value,
                      }))}
                      onValueChange={(next) => {
                        if (
                          (MY_WORK_BOARD_GROUPING_OPTIONS as readonly string[]).includes(
                            next as string,
                          )
                        ) {
                          const grouping = next as MyWorkBoardGrouping;
                          const lane = myWorkBoardSubGroupingOptions(grouping).includes(
                            display.boardLane,
                          )
                            ? display.boardLane
                            : 'none';
                          onDisplayChange({ boardGrouping: grouping, boardLane: lane });
                        }
                      }}
                    >
                      <SelectTrigger aria-label={t('savedViews.grouping')} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MY_WORK_BOARD_GROUPING_OPTIONS.map((value) => ({
                          label: groupingLabel(value),
                          value,
                        })).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={display.grouping}
                      items={groupingOptions.map((value) => ({
                        label: groupingLabel(value),
                        value,
                      }))}
                      onValueChange={(next) => {
                        if (groupingOptions.includes(next as MyWorkListGrouping)) {
                          onDisplayChange({ grouping: next as MyWorkListGrouping });
                        }
                      }}
                    >
                      <SelectTrigger aria-label={t('savedViews.grouping')} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {groupingOptions
                          .map((value) => ({
                            label: groupingLabel(value),
                            value,
                          }))
                          .map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </OptionRow>
                {layout === 'board' ? (
                  <OptionRow label={t('myWork.subGrouping')}>
                    <Select
                      value={display.boardLane}
                      items={myWorkBoardSubGroupingOptions(boardGrouping).map((value) => ({
                        label: groupingLabel(value),
                        value,
                      }))}
                      onValueChange={(next) => {
                        if (
                          myWorkBoardSubGroupingOptions(boardGrouping).includes(
                            next as MyWorkSubGrouping,
                          )
                        ) {
                          onDisplayChange({ boardLane: next as MyWorkSubGrouping });
                        }
                      }}
                    >
                      <SelectTrigger aria-label={t('myWork.subGrouping')} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {myWorkBoardSubGroupingOptions(boardGrouping)
                          .map((value) => ({
                            label: groupingLabel(value),
                            value,
                          }))
                          .map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </OptionRow>
                ) : (
                  <OptionRow label={t('myWork.subGrouping')}>
                    <Select
                      disabled={display.grouping === 'none'}
                      value={display.grouping === 'none' ? 'none' : display.subGrouping}
                      items={myWorkSubGroupingOptions(display.grouping).map((value) => ({
                        label: groupingLabel(value),
                        value,
                      }))}
                      onValueChange={(next) => {
                        if (
                          myWorkSubGroupingOptions(display.grouping).includes(
                            next as MyWorkSubGrouping,
                          )
                        ) {
                          onDisplayChange({ subGrouping: next as MyWorkSubGrouping });
                        }
                      }}
                    >
                      <SelectTrigger aria-label={t('myWork.subGrouping')} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {myWorkSubGroupingOptions(display.grouping)
                          .map((value) => ({
                            label: groupingLabel(value),
                            value,
                          }))
                          .map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </OptionRow>
                )}
                {orderingOptions.length > 1 ? (
                  <OptionRow label={t('savedViews.ordering')}>
                    <Select
                      value={display.ordering}
                      items={orderingOptions.map((value) => ({
                        label: orderingLabel(value),
                        value,
                      }))}
                      onValueChange={(next) => {
                        if (orderingOptions.includes(next as MyWorkOrdering)) {
                          onDisplayChange({ ordering: next as MyWorkOrdering });
                        }
                      }}
                    >
                      <SelectTrigger aria-label={t('savedViews.ordering')} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {orderingOptions
                          .map((value) => ({
                            label: orderingLabel(value),
                            value,
                          }))
                          .map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </OptionRow>
                ) : null}
                <OptionRow label={t('myWork.completedIssues')}>
                  <Select
                    value={display.completed}
                    items={(['all', 'pastDay', 'none'] as MyWorkCompletedWindow[]).map((value) => ({
                      label: t(`myWork.completed.${value}` as never),
                      value,
                    }))}
                    onValueChange={(next) => {
                      if (next === 'all' || next === 'none' || next === 'pastDay') {
                        onDisplayChange({ completed: next });
                      }
                    }}
                  >
                    <SelectTrigger aria-label={t('myWork.completedIssues')} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['all', 'pastDay', 'none'] as MyWorkCompletedWindow[])
                        .map((value) => ({
                          label: t(`myWork.completed.${value}` as never),
                          value,
                        }))
                        .map((option) => (
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
                <OptionRow label={t('myWork.showTriageIssues')}>
                  <Switch
                    aria-label={t('myWork.showTriageIssues')}
                    checked={display.showTriage}
                    onCheckedChange={(checked) => onDisplayChange({ showTriage: checked })}
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
                {layout === 'list' ? (
                  <>
                    <span className="text-sm text-muted-foreground">
                      {t('myWork.displayProperties')}
                    </span>
                    <div className="flex flex-col" style={{ gap: 6 }}>
                      {MY_WORK_ROW_PROPERTIES.map((property) => (
                        <PropertyRow
                          checked={display.properties[property]}
                          key={property}
                          label={t(`myWork.properties.${property}` as never)}
                          onChange={(checked) =>
                            onDisplayChange({
                              properties: { ...display.properties, [property]: checked },
                            })
                          }
                        />
                      ))}
                    </div>
                  </>
                ) : null}
                {canSaveAs ? (
                  <div className="flex flex-row" style={{ justifyContent: 'flex-end' }}>
                    <Button variant="outline" onClick={onSaveAs}>
                      {createElement(BookmarkPlusIcon, { className: 'size-4 shrink-0' })}
                      {t('myWork.saveAs')}
                    </Button>
                  </div>
                ) : null}
              </div>
            }
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
            className: 'size-4 shrink-0',
          })}
        </Button>
      </div>
    );
  },
);

MyWorkControls.displayName = 'MyWorkControls';

export default MyWorkControls;
