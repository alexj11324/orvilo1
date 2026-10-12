'use client';

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
            className="w-37.5 text-sm leading-5.5"
            options={groupingOptions}
            size={'compact'}
            value={options.groupBy}
            onChange={(value) => {
              if (Array.isArray(value) || value == null) return;
              setOptions((prev) => ({ ...prev, groupBy: value }));
            }}
          />
        ),
        label: (
          <span className="text-sm leading-5.5 text-muted-foreground">
            {t('agentViewAll.form.grouping')}
          </span>
        ),
      },
      {
        children: (
          <div className="flex items-center gap-2">
            <ActionIcon
              aria-label={t('sort')}
              icon={options.orderDirection === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              onClick={() => {
                setOptions((prev) => ({
                  ...prev,
                  orderDirection: prev.orderDirection === 'asc' ? 'desc' : 'asc',
                }));
              }}
            />
            <Select
              className="w-28 text-sm leading-5.5"
              options={orderOptions}
              size={'compact'}
              value={options.orderBy}
              onChange={(value) => {
                if (Array.isArray(value) || value == null) return;
                setOptions((prev) => ({ ...prev, orderBy: value }));
              }}
            />
          </div>
        ),
        label: (
          <span className="text-sm leading-5.5 text-muted-foreground">
            {t('agentViewAll.form.ordering')}
          </span>
        ),
      },
    ];

    const panelContent = (
      <div className="flex flex-col gap-3 w-70">
        {/* The list table cannot fit a mobile viewport — the page forces the
            card grid there, so the picker stays desktop-only. */}
        {!isMobile && (
          <Tabs
            value={viewMode}
            onValueChange={(key) => {
              if (typeof key === 'string') setViewMode(key as ViewMode);
            }}
          >
            <TabsList className="flex w-full rounded-(--radius-button) group-data-horizontal/tabs:h-9">
              <TabsTrigger
                className="flex-1 rounded-(--radius-button) text-sm leading-5.5"
                value="list"
              >
                <LayoutList />
                {t('agentViewAll.view.list')}
              </TabsTrigger>
              <TabsTrigger
                className="flex-1 rounded-(--radius-button) text-sm leading-5.5"
                value="card"
              >
                <LayoutGrid />
                {t('agentViewAll.view.card')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <Form items={formItems} itemsType={'flat'} size={'middle'} variant={'borderless'} />
      </div>
    );

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <ActionIcon
              aria-label={t('settings')}
              icon={Settings2Icon}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
            />
          }
        />
        <PopoverContent align="end" className="w-auto p-4" side="bottom">
          {panelContent}
        </PopoverContent>
      </Popover>
    );
  },
);

ListConfig.displayName = 'AgentViewAllListConfig';

export default ListConfig;
