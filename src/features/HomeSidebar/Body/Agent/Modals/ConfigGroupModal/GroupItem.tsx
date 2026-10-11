import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import { GripVertical, PencilLine, Trash } from 'lucide-react';
import { createContext, memo, use, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHomeStore } from '@/store/home';
import type { SessionGroupItemBase } from '@/types/session';

export const GroupItemDragContext = createContext<DraggableSyntheticListeners>(undefined);

const styles = { title: 'min-w-0 flex-1 truncate text-start text-sm' };

interface GroupItemProps extends SessionGroupItemBase {
  disabled?: boolean;
}

const GroupItem = memo<GroupItemProps>(({ id, name, disabled }) => {
  const { t } = useTranslation(['chat', 'common']);

  const [editing, setEditing] = useState(false);
  const [updateGroupName, removeGroup] = useHomeStore((s) => [s.updateGroupName, s.removeGroup]);
  const dragListeners = use(GroupItemDragContext);
  return (
    <>
      {!disabled && (
        <button
          aria-label={t('sessionGroup.drag', 'Drag')}
          className="inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-(--radius-button) text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          type="button"
          {...dragListeners}
        >
          <GripVertical size={16} />
        </button>
      )}
      {!editing ? (
        <>
          <span className={styles.title}>{name}</span>
          <Button
            aria-label={t('edit', { ns: 'common' })}
            disabled={disabled}
            size="icon"

            variant="ghost"
            onClick={() => {
              if (disabled) return;

              setEditing(true);
            }}
          >
            <PencilLine />
          </Button>
          <Button
            aria-label={t('delete', { ns: 'common' })}
            disabled={disabled}
            size="icon"

            variant="ghost"
            onClick={() => {
              if (disabled) return;

              confirmModal({
                cancelText: t('cancel', { ns: 'common' }),
                content: t('sessionGroup.confirmRemoveGroupAlert'),
                okButtonProps: {
                  danger: true,
                },
                okText: t('delete', { ns: 'common' }),
                onOk: async () => {
                  await removeGroup(id);
                },
                title: t('delete', { ns: 'common' }),
              });
            }}
          >
            <Trash />
          </Button>
        </>
      ) : (
        <Input
          autoFocus
          className="flex-1"
          defaultValue={name}
          visualSize="normal"
          onBlur={async (e) => {
            const input = e.target.value;
            setEditing(false);
            if (disabled) return;

            if (name !== input) {
              if (!input || input.length > 20 || input.trim() === '')
                return toast.warning(t('sessionGroup.tooLong'));

              await updateGroupName(id, input);
              toast.success(t('sessionGroup.renameSuccess'));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      )}
    </>
  );
});

export default GroupItem;
