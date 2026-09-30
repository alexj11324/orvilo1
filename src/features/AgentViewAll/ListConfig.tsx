'use client';

import { ActionIcon, Select, Tabs } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  LayoutGrid,
  LayoutList,
  Settings2Icon,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Form, { type FormItemProps } from '@/components/GroupForm';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';

import type { AgentGroupBy, AgentListViewOptions, AgentOrderBy } from './listViewOptions';

type ViewMode = 'card' | 'list';

interface ListConfigProps {
  options: AgentListViewOptions;
  setOptions: (updater: (prev: AgentListViewOptions) => AgentListViewOptions) => void;
  setViewMode: (mode: ViewMode) => void;
  /** Author-based grouping/ordering only makes sense inside a workspace. */
  showAuthor?: boolean;
  viewMode: ViewMode;
}

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    form: css`
      label {
        font-size: 13px !important;
        color: ${cssVar.colorTextSecondary} !important;
      }
    `,
  };
});

const ListConfig = memo<ListConfigProps>(
  ({ options, setOptions, setViewMode, showAuthor, viewMode }) => {
    const [open, setOpen] = useState(false);
    const { t } = useTranslation('common');

    const groupingOptions = useMemo<Array<{ label: string; value: AgentGroupBy }>>(
      () => [
        { label: t('agentViewAll.groupBy.none'), value: 'none' },
        ...(showAuthor
          ? [{ label: t('agentViewAll.groupBy.author'), value: 'author' as const }]
          : []),
        { label: t('agentViewAll.groupBy.label'), value: 'label' },
      ],
      [showAuthor, t],
    );
    const orderOptions = useMemo<Array<{ label: string; value: AgentOrderBy }>>(
      () => [
        { label: t('agentViewAll.orderBy.updatedAt'), value: 'updatedAt' },
        ...(showAuthor
          ? [{ label: t('agentViewAll.orderBy.author'), value: 'author' as const }]
          : []),
        { label: t('agentViewAll.orderBy.title'), value: 'title' },
      ],
      [showAuthor, t],
    );

    const formItems: FormItemProps[] = [
      {
        children: (
          <Select
            options={groupingOptions}
            size={'small'}
            style={{ width: 150 }}
            value={options.groupBy}
            onChange={(value: AgentGroupBy) => {
              setOptions((prev) => ({ ...prev, groupBy: value }));
            }}
          />
        ),
        label: t('agentViewAll.form.grouping'),
      },
      {
        children: (
          <div className="flex items-center gap-2">
            <ActionIcon
              icon={options.orderDirection === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow}
              size={'small'}
              onClick={() => {
                setOptions((prev) => ({
                  ...prev,
                  orderDirection: prev.orderDirection === 'asc' ? 'desc' : 'asc',
                }));
              }}
            />
            <Select
              options={orderOptions}
              size={'small'}
              style={{ width: 112 }}
              value={options.orderBy}
              onChange={(value: AgentOrderBy) => {
                setOptions((prev) => ({ ...prev, orderBy: value }));
              }}
            />
          </div>
        ),
        label: t('agentViewAll.form.ordering'),
      },
    ];

    const panelContent = (
      <div className="flex flex-col gap-3" style={{ width: 280 }}>
        <Tabs
          activeKey={viewMode}
          items={[
            { icon: <LayoutList />, key: 'list', label: t('agentViewAll.view.list') },
            { icon: <LayoutGrid />, key: 'card', label: t('agentViewAll.view.card') },
          ]}
          styles={{
            list: { display: 'flex', width: '100%' },
            tab: { flex: 1 },
          }}
          onChange={(key) => setViewMode(key as ViewMode)}
        />
        <Form
          className={styles.form}
          items={formItems}
          itemsType={'flat'}
          size={'small'}
          variant={'borderless'}
        />
      </div>
    );

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<ActionIcon icon={Settings2Icon} size={DESKTOP_HEADER_ICON_SMALL_SIZE} />}
        />
        <PopoverContent align="end" side="bottom" style={{ padding: 12 }}>
          {panelContent}
        </PopoverContent>
      </Popover>
    );
  },
);

ListConfig.displayName = 'AgentViewAllListConfig';

export default ListConfig;
