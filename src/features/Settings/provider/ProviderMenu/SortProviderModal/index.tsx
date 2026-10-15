import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import { Sortable, SortableItem } from '@/components/reui/sortable';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { useAiInfraStore } from '@/store/aiInfra';
import { type AiProviderListItem } from '@/types/aiProvider';

import GroupItem from './GroupItem';

const styles = {
  container:
    'h-9 rounded-(--radius-button) px-2 text-sm leading-5.5 transition-[background-color] duration-(--orvilo-motion-mid) ease-in-out motion-reduce:transition-none hover:bg-accent',
};

interface ConfigGroupModalProps {
  defaultItems: AiProviderListItem[];
  onCancel: () => void;
  open: boolean;
}
const ConfigGroupModal = memo<ConfigGroupModalProps>(({ open, onCancel, defaultItems }) => {
  const { t } = useTranslation('modelProvider');
  const { allowed: canManageProvider } = usePermission('manage_provider_key');
  const updateAiProviderSort = useAiInfraStore((s) => s.updateAiProviderSort);
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
          getItemValue={(item) => item.id}
          value={items}
          onValueChange={(nextItems) => {
            if (!canManageProvider) return;
            setItems(nextItems);
          }}
        >
          {items.map((item) => (
            <SortableItem
              className={`flex items-center justify-between gap-1 ${styles.container}`}
              disabled={!canManageProvider}
              key={item.id}
              value={item.id}
            >
              <GroupItem {...item} disabled={!canManageProvider} />
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

            const sortMap = items.map((item, index) => ({
              id: item.id,
              sort: index,
            }));
            setLoading(true);
            await updateAiProviderSort(sortMap);
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

export default ConfigGroupModal;
