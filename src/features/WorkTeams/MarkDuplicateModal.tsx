'use client';
import { Modal } from '@lobehub/ui/base-ui';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { workAttentionService } from '@/services/workAttention';

interface MarkDuplicateModalProps {
  onClose: () => void;
  onConfirm: (taskId: string, canonicalTaskId: string) => void;
  open: boolean;
  taskId: string | null;
}

/**
 * Duplicate-of target picker backed by `workAttention.search` — the
 * permission-filtered canonical task search — instead of whatever task list
 * the surrounding page happens to have loaded. The current task is never a
 * legal canonical for itself, so it is filtered out of every option set.
 */
const MarkDuplicateModal = memo<MarkDuplicateModalProps>(({ onClose, onConfirm, open, taskId }) => {
  const { t } = useTranslation('common');
  const [needle, setNeedle] = useState('');
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) {
      setNeedle('');
      setOptions([]);
      setSelected(undefined);
      return;
    }
    if (!needle.trim()) {
      setOptions([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void workAttentionService
        .search({ limitPerType: 10, query: needle.trim(), type: 'task' })
        .then((result) => {
          const items = result?.data ?? [];
          setOptions(
            items
              .filter((item) => item.type === 'task' && item.id !== taskId)
              .map((item) => ({
                label: item.description
                  ? `${item.description} · ${item.title ?? item.id}`
                  : (item.title ?? item.id),
                value: item.id,
              })),
          );
        })
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [needle, open, taskId]);

  const confirm = () => {
    if (taskId && selected) onConfirm(taskId, selected);
    onClose();
  };

  return (
    <Modal
      destroyOnHidden
      open={open}
      title={t('teams.markDuplicate')}
      width={480}
      footer={
        <div className="flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button disabled={!selected} onClick={confirm}>
            {t('teams.markDuplicateConfirm')}
          </Button>
        </div>
      }
      onCancel={onClose}
    >
      <div className="flex flex-col gap-2 py-2">
        <span className="text-sm text-muted-foreground">{t('teams.markDuplicateHint')}</span>
        <Combobox
          filter={null}
          inputValue={needle}
          items={options.map((option) => option.value)}
          value={selected ?? null}
          itemToStringLabel={(value) =>
            options.find((option) => option.value === value)?.label ?? value
          }
          onInputValueChange={setNeedle}
          onValueChange={(value) => setSelected(value ?? undefined)}
        >
          <ComboboxInput
            aria-label={t('teams.markDuplicatePlaceholder')}
            placeholder={t('teams.markDuplicatePlaceholder')}
            showTrigger={false}
          />
          <ComboboxContent>
            <ComboboxEmpty>
              {needle.trim()
                ? searching
                  ? t('teams.loading')
                  : t('teams.markDuplicateEmpty')
                : t('teams.markDuplicatePrompt')}
            </ComboboxEmpty>
            <ComboboxList>
              {(value: string) => (
                <ComboboxItem key={value} value={value}>
                  {options.find((option) => option.value === value)?.label ?? value}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    </Modal>
  );
});

MarkDuplicateModal.displayName = 'MarkDuplicateModal';

export default MarkDuplicateModal;
