import { type KeyboardEvent, memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Input } from '@/components/ui/input';
import { useKnowledgeBaseStore } from '@/store/library';

interface EditingProps {
  id: string;
  name: string;
  toggleEditing: (visible?: boolean) => void;
}

const Editing = memo<EditingProps>(({ id, name, toggleEditing }) => {
  const { t } = useTranslation('common');

  const [editing, updateKnowledgeBase] = useKnowledgeBaseStore((s) => [
    s.knowledgeBaseRenamingId === id,
    s.updateKnowledgeBase,
  ]);
  const [newName, setNewName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!editing) return;

    setNewName(name);
    submittingRef.current = false;

    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editing, name]);

  const handleUpdate = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;

    const value = newName.trim();
    if (value && value !== name) {
      try {
        await updateKnowledgeBase(id, { name: value });
      } catch {
        toast.error(t('operationFailed'));
      }
    }

    toggleEditing(false);
  }, [id, name, newName, t, toggleEditing, updateKnowledgeBase]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleUpdate();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        toggleEditing(false);
      }
    },
    [handleUpdate, toggleEditing],
  );

  if (!editing) return null;

  return (
    <Input
      className="h-7"
      maxLength={64}
      ref={inputRef}
      style={{ width: '100%' }}
      value={newName}
      onBlur={() => void handleUpdate()}
      onChange={(e) => setNewName(e.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
    />
  );
});

export default Editing;
