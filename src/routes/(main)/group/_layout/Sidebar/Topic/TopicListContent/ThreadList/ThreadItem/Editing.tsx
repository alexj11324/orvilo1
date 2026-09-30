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
  const [editing, updateThreadTitle] = useChatStore((s) => [
    s.threadRenamingId === id,
    s.updateThreadTitle,
  ]);

  const handleUpdate = useCallback(async () => {
    if (newTitle && title !== newTitle) {
      await updateThreadTitle(id, newTitle);
    }
    toggleEditing(false);
  }, [newTitle, title, id, updateThreadTitle, toggleEditing]);

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
          onClick={(e) => e.stopPropagation()}
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
