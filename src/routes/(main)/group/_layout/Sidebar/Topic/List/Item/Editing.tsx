import { stopPropagation } from '@lobehub/ui';
import { memo, useCallback, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useChatStore } from '@/store/chat';

interface EditingProps {
  id: string;
  title: string;
  toggleEditing: (visible?: boolean) => void;
}

const Editing = memo<EditingProps>(({ id, title, toggleEditing }) => {
  const [newTitle, setNewTitle] = useState(title);
  const [editing, updateTopicTitle] = useChatStore((s) => [
    s.topicRenamingId === id,
    s.updateTopicTitle,
  ]);

  const handleUpdate = useCallback(async () => {
    if (newTitle && title !== newTitle) {
      await updateTopicTitle(id, newTitle);
    }
    toggleEditing(false);
  }, [newTitle, title, id, updateTopicTitle, toggleEditing]);

  return (
    <Popover
      open={editing}
      onOpenChange={(open) => {
        if (!open) handleUpdate();
        toggleEditing(open);
      }}
    >
      <PopoverTrigger render={<div />} />
      <PopoverContent align="start" side="bottom" style={{ padding: 4, width: 320 }}>
        <Input
          autoFocus
          defaultValue={title}
          onChange={(e) => setNewTitle(e.target.value)}
          onClick={stopPropagation}
          onBlur={() => {
            handleUpdate();
            toggleEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleUpdate();
              toggleEditing(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
});

export default Editing;
