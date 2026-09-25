'use client';

import { Flexbox } from '@lobehub/ui';
import { ActionIcon, Button, Popover, Select, Switch, Text } from '@lobehub/ui/base-ui';
import type { MyWorkMode, WorkQueryLayout } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  BookmarkPlusIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  Settings2Icon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { BuilderState } from '@/features/SavedViews/workQueryBuilder';

import {
  MY_WORK_BOARD_GROUPING_OPTIONS,
  MY_WORK_ROW_PROPERTIES,
  type MyWorkBoardGrouping,
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
  <Flexbox horizontal align="center" gap={8}>
    <span className={styles.optionLabel}>{label}</span>
    <Flexbox flex={1} style={{ minWidth: 0 }}>
      {children}
    </Flexbox>
  </Flexbox>
));

OptionRow.displayName = 'OptionRow';

/** A display-property toggle — label left, switch right (Linear's list). */
const PropertyRow = memo<{
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}>(({ checked, label, onChange }) => (
  <Flexbox horizontal align="center" justify="space-between">
    <Text fontSize={13}>{label}</Text>
    <Switch checked={checked} size="small" onChange={onChange} />
  </Flexbox>
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
      <Flexbox horizontal align="center" gap={6} style={{ flex: 'none' }}>
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
        <Popover
          placement="bottomRight"
          trigger="click"
          content={
            <Flexbox className={styles.controlPopover} gap={12}>
              {canBoard ? (
                <OptionRow label={t('myWork.displayLayout')}>
                  <Select
                    size="small"
                    style={{ minWidth: 140 }}
                    value={layout}
                    options={[
                      { label: t('myWork.layoutList'), value: 'list' },
                      { label: t('myWork.layoutBoard'), value: 'board' },
                    ]}
                    onChange={(next) => {
                      if (next === 'board' || next === 'list') onLayoutChange(next);
                    }}
                  />
                </OptionRow>
              ) : null}
              <OptionRow label={t('savedViews.grouping')}>
                {layout === 'board' ? (
                  <Select
                    size="small"
                    style={{ minWidth: 150 }}
                    value={boardGrouping}
                    options={MY_WORK_BOARD_GROUPING_OPTIONS.map((value) => ({
                      label: groupingLabel(value),
                      value,
                    }))}
                    onChange={(next) => {
                      if (next === 'status' || next === 'workflowCategory') {
                        onDisplayChange({ boardGrouping: next });
                      }
                    }}
                  />
                ) : (
                  <Select
                    size="small"
                    style={{ minWidth: 150 }}
                    value={display.grouping}
                    options={groupingOptions.map((value) => ({
                      label: groupingLabel(value),
                      value,
                    }))}
                    onChange={(next) => {
                      if (groupingOptions.includes(next as MyWorkListGrouping)) {
                        onDisplayChange({ grouping: next as MyWorkListGrouping });
                      }
                    }}
                  />
                )}
              </OptionRow>
              {layout === 'list' ? (
                <OptionRow label={t('myWork.subGrouping')}>
                  <Select
                    disabled={display.grouping === 'none'}
                    size="small"
                    style={{ minWidth: 150 }}
                    value={display.grouping === 'none' ? 'none' : display.subGrouping}
                    options={myWorkSubGroupingOptions(display.grouping).map((value) => ({
                      label: groupingLabel(value),
                      value,
                    }))}
                    onChange={(next) => {
                      if (
                        myWorkSubGroupingOptions(display.grouping).includes(
                          next as MyWorkSubGrouping,
                        )
                      ) {
                        onDisplayChange({ subGrouping: next as MyWorkSubGrouping });
                      }
                    }}
                  />
                </OptionRow>
              ) : null}
              {orderingOptions.length > 1 ? (
                <OptionRow label={t('savedViews.ordering')}>
                  <Select
                    size="small"
                    style={{ minWidth: 170 }}
                    value={display.ordering}
                    options={orderingOptions.map((value) => ({
                      label: orderingLabel(value),
                      value,
                    }))}
                    onChange={(next) => {
                      if (orderingOptions.includes(next as MyWorkOrdering)) {
                        onDisplayChange({ ordering: next as MyWorkOrdering });
                      }
                    }}
                  />
                </OptionRow>
              ) : null}
              <OptionRow label={t('myWork.completedIssues')}>
                <Select
                  size="small"
                  style={{ minWidth: 140 }}
                  value={display.completed}
                  options={(['all', 'pastDay', 'none'] as MyWorkCompletedWindow[]).map((value) => ({
                    label: t(`myWork.completed.${value}` as never),
                    value,
                  }))}
                  onChange={(next) => {
                    if (next === 'all' || next === 'none' || next === 'pastDay') {
                      onDisplayChange({ completed: next });
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
              <OptionRow label={t('myWork.showTriageIssues')}>
                <Switch
                  checked={display.showTriage}
                  size="small"
                  onChange={(checked) => onDisplayChange({ showTriage: checked })}
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
              {layout === 'list' ? (
                <>
                  <Text fontSize={12} type="secondary">
                    {t('myWork.displayProperties')}
                  </Text>
                  <Flexbox gap={6}>
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
                  </Flexbox>
                </>
              ) : null}
              {canSaveAs ? (
                <Flexbox horizontal justify="flex-end">
                  <Button icon={BookmarkPlusIcon} size="small" onClick={onSaveAs}>
                    {t('myWork.saveAs')}
                  </Button>
                </Flexbox>
              ) : null}
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

MyWorkControls.displayName = 'MyWorkControls';

export default MyWorkControls;
