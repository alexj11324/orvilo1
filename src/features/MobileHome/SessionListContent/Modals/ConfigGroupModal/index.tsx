import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { Plus } from 'lucide-react';
import { memo, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import { usePermission } from '@/hooks/usePermission';
import { useSessionStore } from '@/store/session';
import { sessionGroupSelectors } from '@/store/session/selectors';
import { type SessionGroupItem } from '@/types/session';

import GroupItem, { GroupItemDragContext } from './GroupItem';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    height: 36px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};
    transition: background 0.2s ease-in-out;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

interface ConfigGroupModalProps {
  onCancel?: () => void;
  open?: boolean;
}

const SortableRow = ({ children, id }: { children: ReactNode; id: string }) => {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id,
  });
  return (
    <div
      className={`${styles.container} flex items-center justify-between gap-1`}
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0.6 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
    >
      <GroupItemDragContext value={listeners}>{children}</GroupItemDragContext>
    </div>
  );
};

const ConfigGroupModal = memo<ConfigGroupModalProps>(({ open, onCancel }) => {
  const { t } = useTranslation('chat');
  const { allowed: canCreate, reason: createReason } = usePermission('create_content');
  const { allowed: canEdit } = usePermission('edit_own_content');
  const sessionGroupItems = useSessionStore(sessionGroupSelectors.sessionGroupItems, isEqual);
  const [addSessionGroup, updateSessionGroupSort] = useSessionStore((s) => [
    s.addSessionGroup,
    s.updateSessionGroupSort,
  ]);
  const [loading, setLoading] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  return (
    <ImperativeModal
      allowFullscreen
      footer={null}
      open={open}
      title={t('sessionGroup.config')}
      width={400}
      onCancel={onCancel}
    >
      <div className="flex flex-col">
        <DndContext
          collisionDetection={closestCenter}
          sensors={sensors}
          onDragEnd={({ active, over }) => {
            if (!canEdit || !over || active.id === over.id) return;
            const oldIndex = sessionGroupItems.findIndex((item) => item.id === active.id);
            const newIndex = sessionGroupItems.findIndex((item) => item.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return;
            updateSessionGroupSort(arrayMove(sessionGroupItems, oldIndex, newIndex));
          }}
        >
          <SortableContext
            items={sessionGroupItems.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            {sessionGroupItems.map((item: SessionGroupItem) => (
              <SortableRow id={item.id} key={item.id}>
                <GroupItem {...item} disabled={!canEdit} />
              </SortableRow>
            ))}
          </SortableContext>
        </DndContext>
        <Button
          block
          disabled={!canCreate}
          icon={<Plus size={14} />}
          loading={loading}
          title={createReason}
          onClick={async () => {
            if (!canCreate) return;
            setLoading(true);
            await addSessionGroup(t('sessionGroup.newGroup'));
            setLoading(false);
          }}
        >
          {t('sessionGroup.createGroup')}
        </Button>
      </div>
    </ImperativeModal>
  );
});

export default ConfigGroupModal;
