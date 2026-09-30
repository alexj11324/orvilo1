import { type SidebarGroup } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { HashIcon, Loader2 } from 'lucide-react';
import React, { memo, useCallback, useMemo, useState } from 'react';

import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import SidebarContextMenu from '@/features/NavPanel/components/SidebarContextMenu';
import { useHomeStore } from '@/store/home';

import { useCreateMenuItems } from '../../../../hooks';
import { useAgentModal } from '../../ModalProvider';
import SessionList from '../List';
import Actions from './Actions';
import { useGroupDropdownMenu } from './useDropdownMenu';

const styles = createStaticStyles(({ css }) => ({
  item: css`
    padding-inline-start: 14px;
  `,
}));

const GroupItem = memo<SidebarGroup>(({ items, id, name, visibility }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const isUpdating = useHomeStore((s) => s.groupUpdatingId === id);

  // Modal management
  const { openConfigGroupModal } = useAgentModal();

  // Create menu items
  const { isLoading } = useCreateMenuItems();

  const handleOpenConfigGroupModal = useCallback(() => {
    openConfigGroupModal(visibility);
  }, [openConfigGroupModal, visibility]);

  const dropdownMenu = useGroupDropdownMenu({
    anchor,
    id,
    isCustomGroup: true,
    name,
    openConfigGroupModal: handleOpenConfigGroupModal,
    visibility,
  });

  const groupIcon = useMemo(() => {
    if (isUpdating) {
      return <Loader2 className="animate-spin" size={16} style={{ opacity: 0.5 }} />;
    }
    return <HashIcon size={16} style={{ opacity: 0.5 }} />;
  }, [isUpdating]);

  return (
    <AccordionItem disabled={isUpdating} key={id} value={id}>
      <SidebarContextMenu items={dropdownMenu}>
        <div ref={setAnchor}>
          <div className="flex items-center">
            <div className="min-w-0 flex-1">
              <AccordionTrigger>
                <div className="flex items-center gap-[6px]" style={{ overflow: 'hidden' }}>
                  {groupIcon}
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {name}
                  </span>
                </div>
              </AccordionTrigger>
            </div>
            <div className="flex shrink-0 items-center">
              <Actions dropdownMenu={dropdownMenu} isLoading={isLoading} />
            </div>
          </div>
        </div>
      </SidebarContextMenu>
      <AccordionContent>
        <SessionList
          dataSource={items}
          groupId={id}
          itemClassName={styles.item}
          visibility={visibility}
        />
      </AccordionContent>
    </AccordionItem>
  );
});

export default GroupItem;
