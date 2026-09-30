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
import { createStaticStyles } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { Plus } from 'lucide-react';
import { memo, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { usePermission } from '@/hooks/usePermission';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import type { SessionGroupItemBase } from '@/types/session';

import GroupItem, { GroupItemDragContext } from './GroupItem';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    height: 36px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius}px;
    transition: background 0.2s ease-in-out;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

interface ConfigGroupModalProps {
  onCancel?: () => void;
  open?: boolean;
  scope?: 'private' | 'public';
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

const ConfigGroupModal = memo<ConfigGroupModalProps>(({ open, onCancel, scope = 'public' }) => {
  const { t } = useTranslation('chat');
  const { allowed: canEdit } = usePermission('edit_own_content');
  // Map SidebarGroup to SessionGroupItem-like structure for the sortable list
  const sessionGroupItems = useHomeStore(
    (s) =>
      (scope === 'private'
        ? homeAgentListSelectors.privateAgentGroups(s)
        : homeAgentListSelectors.agentGroups(s)
      ).map((g) => ({
        id: g.id,
        name: g.name,
        sort: g.sort,
      })),
    isEqual,
  ) as SessionGroupItemBase[];
  const [addGroup, updateGroupSort] = useHomeStore((s) => [s.addGroup, s.updateGroupSort]);
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

            updateGroupSort(arrayMove(sessionGroupItems, oldIndex, newIndex));
          }}
        >
          <SortableContext
            items={sessionGroupItems.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            {sessionGroupItems.map((item: SessionGroupItemBase) => (
              <SortableRow id={item.id} key={item.id}>
                <GroupItem {...item} disabled={!canEdit} />
              </SortableRow>
            ))}
          </SortableContext>
        </DndContext>
        <Button
          aria-busy={loading}
          className="w-full"
          disabled={!canEdit || loading}
          onClick={async () => {
            if (!canEdit) return;

            setLoading(true);
            await addGroup(t('sessionGroup.newGroup'), scope === 'private' ? 'private' : undefined);
            setLoading(false);
          }}
        >
          {loading ? <Spinner /> : <Plus />}
          {t('sessionGroup.createGroup')}
        </Button>
      </div>
    </ImperativeModal>
  );
});

export default ConfigGroupModal;
