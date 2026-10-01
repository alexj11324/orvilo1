import { type SidebarGroup } from '@orvilo/types';
import React, { memo } from 'react';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { Accordion } from '@/components/ui/accordion';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import Item from './Item';

interface GroupProps {
  dataSource: SidebarGroup[];
}

const Group = memo<GroupProps>(({ dataSource }) => {
  const activeWorkspaceId = useActiveWorkspaceId();
  const sessionGroupKeys = useGlobalStore(
    systemStatusSelectors.sessionGroupKeys(activeWorkspaceId),
  );
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  return (
    <Accordion
      multiple
      value={sessionGroupKeys}
      onValueChange={(keys) => updateSystemStatus({ expandSessionGroupKeys: keys.map(String) })}
    >
      {dataSource.map((item) => (
        <Item {...item} key={item.id} />
      ))}
    </Accordion>
  );
});

export default Group;
