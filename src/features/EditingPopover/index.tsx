'use client';

import { Popover } from '@base-ui/react/popover';

import AgentContent from './AgentContent';
import GroupContent from './GroupContent';
import { useEditingPopoverStore } from './store';

const EditingPopover = () => {
  const target = useEditingPopoverStore((s) => s.target);
  const close = useEditingPopoverStore((s) => s.close);

  return (
    <Popover.Root
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Popover.Portal>
        <Popover.Positioner align="start" anchor={target?.anchor ?? document.body} side="bottom">
          <Popover.Popup data-testid="editing-popover" style={{ padding: 4 }}>
            {target?.type === 'agent' ? (
              <AgentContent
                avatar={target.avatar}
                id={target.id}
                title={target.title}
                onClose={close}
              />
            ) : target ? (
              <GroupContent
                avatar={target.avatar}
                backgroundColor={target.backgroundColor}
                id={target.id}
                memberAvatars={target.memberAvatars}
                title={target.title}
                type={target.type}
                onClose={close}
              />
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default EditingPopover;
