import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import { ActionIcon, confirmModal, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { GripVertical, PencilLine, Trash } from 'lucide-react';
import { createContext, memo, use, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { useSessionStore } from '@/store/session';
import { type SessionGroupItem } from '@/types/session';

export const GroupItemDragContext = createContext<DraggableSyntheticListeners>(undefined);

const styles = createStaticStyles(({ css }) => ({
  content: css`
    position: relative;
    overflow: hidden;
    flex: 1;
  `,
  title: css`
    flex: 1;
    height: 28px;
    line-height: 28px;
    text-align: start;
  `,
}));

interface GroupItemProps extends SessionGroupItem {
  disabled?: boolean;
}

const GroupItem = memo<GroupItemProps>(({ id, name, disabled = false }) => {
  const { t } = useTranslation(['chat', 'common']);

  const [editing, setEditing] = useState(false);
  const [updateSessionGroupName, removeSessionGroup] = useSessionStore((s) => [
    s.updateSessionGroupName,
    s.removeSessionGroup,
  ]);

  const dragListeners = use(GroupItemDragContext);

  return (
    <>
      {!disabled && (
        <button
          aria-label={t('sessionGroup.drag', 'Drag')}
          className="cursor-grab text-muted-foreground"
          type="button"
          {...dragListeners}
        >
          <GripVertical size={14} />
        </button>
      )}
      {!editing ? (
        <>
          <span className={styles.title}>{name}</span>
          <ActionIcon
            disabled={disabled}
            icon={PencilLine}
            size={'small'}
            onClick={() => {
              if (disabled) return;
              setEditing(true);
            }}
          />
          <ActionIcon
            disabled={disabled}
            icon={Trash}
            size={'small'}
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
                  await removeSessionGroup(id);
                },
                title: t('delete', { ns: 'common' }),
              });
            }}
          />
        </>
      ) : (
        <Input
          autoFocus
          className="h-7 flex-1"
          defaultValue={name}
          onBlur={async (e) => {
            const input = e.target.value;
            setEditing(false);
            if (disabled) return;
            if (name !== input) {
              if (!input || input.length > 20 || input.trim() === '')
                return toast.warning(t('sessionGroup.tooLong'));

              await updateSessionGroupName(id, input);
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
