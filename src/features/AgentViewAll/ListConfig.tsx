'use client';

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

import ActionIcon from '@/components/ActionIcon';
import Form, { type FormItemProps } from '@/components/GroupForm';
import Select from '@/components/Select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { useIsMobile } from '@/hooks/useIsMobile';

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
    const isMobile = useIsMobile();

    const groupingOptions = useMemo<Array<{ label: string; value: AgentGroupBy }>>(
      () => [
        { label: t('agentViewAll.groupBy.none'), value: 'none' },
        ...(showAuthor
          ? [{ label: t('agentViewAll.groupBy.author'), value: 'author' as const }]
          : []),
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
            onChange={(value) => {
              if (Array.isArray(value) || value == null) return;
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
              aria-label={t('sort')}
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
              onChange={(value) => {
                if (Array.isArray(value) || value == null) return;
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
        {/* The list table cannot fit a mobile viewport — the page forces the
            card grid there, so the picker stays desktop-only. */}
        {!isMobile && (
          <Tabs
            value={viewMode}
            onValueChange={(key) => {
              if (typeof key === 'string') setViewMode(key as ViewMode);
            }}
          >
            <TabsList style={{ display: 'flex', width: '100%' }}>
              <TabsTrigger style={{ flex: 1 }} value="list">
                <LayoutList />
                {t('agentViewAll.view.list')}
              </TabsTrigger>
              <TabsTrigger style={{ flex: 1 }} value="card">
                <LayoutGrid />
                {t('agentViewAll.view.card')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
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
          render={
            <ActionIcon
              aria-label={t('settings')}
              icon={Settings2Icon}
              size={DESKTOP_HEADER_ICON_SMALL_SIZE}
            />
          }
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
