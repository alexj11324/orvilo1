import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import { cn } from 'cn';
import { type AiProviderModelListItem } from 'model-bank';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import { Sortable, SortableItem } from '@/components/reui/sortable';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { useAiInfraStore } from '@/store/aiInfra';

import ListItem from './ListItem';

const SORT_MODIFIERS = [restrictToVerticalAxis, restrictToWindowEdges];
const getItemId = (item: { id: string }) => item.id;

const styles = {
  container:
    'h-9 rounded-(--radius-button) px-2 text-sm leading-5.5 transition-[background-color] duration-(--orvilo-motion-mid) ease-in-out motion-reduce:transition-none hover:bg-accent',
};

interface SortModelModalProps {
  defaultItems: AiProviderModelListItem[];
  onCancel: () => void;
  open: boolean;
}
const SortModelModal = memo<SortModelModalProps>(({ open, onCancel, defaultItems }) => {
  const { t } = useTranslation('modelProvider');
  const { allowed: canManageProvider } = usePermission('manage_provider_key');
  const [providerId, updateAiModelsSort] = useAiInfraStore((s) => [
    s.activeAiProvider,
    s.updateAiModelsSort,
  ]);
  const [loading, setLoading] = useState(false);

  const [items, setItems] = useState(defaultItems);
  return (
    <ImperativeModal
      allowFullscreen
      footer={null}
      open={open}
      title={t('sortModal.title')}
      width={400}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-4">
        <Sortable
          className="flex flex-col gap-2"
          getItemValue={getItemId}
          modifiers={SORT_MODIFIERS}
          value={items}
          onValueChange={(items: AiProviderModelListItem[]) => {
            if (!canManageProvider) return;

            setItems(items);
          }}
        >
          {items.map((item) => (
            <SortableItem
              className={cn(styles.container, 'flex items-center justify-between gap-1')}
              key={item.id}
              value={item.id}
            >
              <ListItem {...item} disabled={!canManageProvider} />
            </SortableItem>
          ))}
        </Sortable>
        <Button
          className="sticky inset-be-0 w-full leading-5.5"
          disabled={!canManageProvider}
          loading={loading}
          size="lg"
          type="button"
          variant="default"
          onClick={async () => {
            if (!canManageProvider) return;
            if (!providerId) return;

            const sortMap = items.map((item, index) => ({
              id: item.id,
              sort: index,
              type: item.type,
            }));

            setLoading(true);
            await updateAiModelsSort(providerId, sortMap);
            setLoading(false);
            toast.success(t('sortModal.success'));
            onCancel();
          }}
        >
          {t('sortModal.update')}
        </Button>
      </div>
    </ImperativeModal>
  );
});

export default SortModelModal;
