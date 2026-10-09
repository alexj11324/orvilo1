'use client';

import isEqual from 'fast-deep-equal';
import { ArrowDownUpIcon, ChevronRightIcon } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import {
  renderSidebarMenuItems,
  type SidebarMenuItems,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import { aiProviderSelectors } from '@/store/aiInfra';
import { useAiInfraStore } from '@/store/aiInfra/store';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import Actions from './Actions';
import All from './All';
import ProviderItem from './Item';
import SortProviderModal from './SortProviderModal';
import { SortType, useProviderDropdownMenu } from './useDropdownMenu';

interface ProviderSectionProps {
  action?: ReactNode;
  children: ReactNode;
  contextMenuItems: SidebarMenuItems;
  count: number;
  title: string;
}

const ProviderSection = ({
  action,
  children,
  contextMenuItems,
  count,
  title,
}: ProviderSectionProps) => {
  const header = (
    <div className="mt-2 flex h-7 items-center pr-1">
      <CollapsibleTrigger className="group/trigger flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset">
        <span className="truncate">{title}</span>
        <span className="font-normal tabular-nums">{count}</span>
        <ChevronRightIcon
          aria-hidden
          className="size-3 flex-none opacity-0 transition-transform group-hover/trigger:opacity-100 group-focus-visible/trigger:opacity-100 group-data-[panel-open]/trigger:rotate-90"
        />
      </CollapsibleTrigger>
      {action}
    </div>
  );

  return (
    <Collapsible defaultOpen>
      {contextMenuItems.length > 0 ? (
        <ContextMenu>
          <ContextMenuTrigger render={header} />
          <ContextMenuContent>
            {renderSidebarMenuItems(contextMenuItems, [], 'context')}
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        header
      )}
      <CollapsibleContent>
        <div className="flex flex-col">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const ProviderList = (props: {
  mobile?: boolean;
  onProviderSelect: (providerKey: string) => void;
}) => {
  const { onProviderSelect, mobile } = props;
  const { t } = useTranslation('modelProvider');
  const [open, setOpen] = useState(false);

  const [sortType, updateSystemStatus] = useGlobalStore((s) => [
    systemStatusSelectors.disabledModelProvidersSortType(s),
    s.updateSystemStatus,
  ]);

  const updateSortType = useCallback(
    (newSortType: SortType) => {
      updateSystemStatus({ disabledModelProvidersSortType: newSortType });
    },
    [updateSystemStatus],
  );

  const dropdownMenu = useProviderDropdownMenu({
    onSortChange: updateSortType,
    sortType: (sortType || SortType.Default) as SortType,
  });

  const enabledModelProviderList = useAiInfraStore(
    aiProviderSelectors.enabledAiProviderList,
    isEqual,
  );

  const disabledModelProviderList = useAiInfraStore(
    aiProviderSelectors.disabledAiProviderList,
    isEqual,
  );

  const disabledCustomProviderList = useAiInfraStore(
    aiProviderSelectors.disabledCustomAiProviderList,
    isEqual,
  );

  // Sort model providers based on sort type
  const sortedDisabledProviders = useMemo(() => {
    const providers = [...disabledModelProviderList];
    const currentSortType = (sortType || SortType.Default) as SortType;
    switch (currentSortType) {
      case SortType.Alphabetical: {
        return providers.sort((a, b) => {
          const cmpDisplay = (a.name || a.id).localeCompare(b.name || b.id);
          if (cmpDisplay !== 0) return cmpDisplay;
          return a.id.localeCompare(b.id);
        });
      }
      case SortType.AlphabeticalDesc: {
        return providers.sort((a, b) => {
          const cmpDisplay = (b.name || a.id).localeCompare(a.name || b.id);
          if (cmpDisplay !== 0) return cmpDisplay;
          return b.id.localeCompare(a.id);
        });
      }
      case SortType.Default: {
        return providers;
      }
    }
  }, [disabledModelProviderList, sortType]);

  const canSortDisabled = disabledModelProviderList.length > 1;

  return (
    <div className="flex flex-col px-2 pb-8">
      {!mobile && <All onClick={onProviderSelect} />}
      {open && (
        <SortProviderModal
          defaultItems={enabledModelProviderList}
          open={open}
          onCancel={() => {
            setOpen(false);
          }}
        />
      )}
      <ProviderSection
        contextMenuItems={[]}
        count={enabledModelProviderList.length}
        title={t('menu.list.enabled')}
        action={
          <ActionIcon
            icon={ArrowDownUpIcon}
            size={'small'}
            title={t('menu.sort')}
            onClick={() => setOpen(true)}
          />
        }
      >
        {enabledModelProviderList.map((item) => (
          <ProviderItem {...item} key={item.id} onClick={onProviderSelect} />
        ))}
      </ProviderSection>

      {disabledCustomProviderList.length > 0 && (
        <ProviderSection
          contextMenuItems={[]}
          count={disabledCustomProviderList.length}
          title={t('menu.list.custom')}
        >
          {disabledCustomProviderList.map((item) => (
            <ProviderItem {...item} key={item.id} onClick={onProviderSelect} />
          ))}
        </ProviderSection>
      )}

      <ProviderSection
        action={canSortDisabled ? <Actions dropdownMenu={dropdownMenu} /> : undefined}
        contextMenuItems={canSortDisabled ? dropdownMenu : []}
        count={disabledModelProviderList.length}
        title={t('menu.list.disabled')}
      >
        {sortedDisabledProviders.map((item) => (
          <ProviderItem {...item} key={item.id} onClick={onProviderSelect} />
        ))}
      </ProviderSection>
    </div>
  );
};

export default ProviderList;
