'use client';

import { Flexbox } from '@lobehub/ui';
import { AutoComplete, Button, Modal, Text } from '@lobehub/ui/base-ui';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
        <Flexbox horizontal gap={8} justify="flex-end">
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button disabled={!selected} type="primary" onClick={confirm}>
            {t('teams.markDuplicateConfirm')}
          </Button>
        </Flexbox>
      }
      onCancel={onClose}
    >
      <Flexbox gap={8} paddingBlock={8}>
        <Text fontSize={13} type="secondary">
          {t('teams.markDuplicateHint')}
        </Text>
        <AutoComplete
          // Server-side search: antd's default filter matches typed text against
          // `value` (the task id) and would drop every fetched option.
          filterOption={false}
          options={options}
          placeholder={t('teams.markDuplicatePlaceholder')}
          style={{ width: '100%' }}
          emptyText={
            needle.trim()
              ? searching
                ? t('teams.loading')
                : t('teams.markDuplicateEmpty')
              : t('teams.markDuplicatePrompt')
          }
          onSearch={setNeedle}
          onChange={(value) =>
            setSelected(options.some((option) => option.value === value) ? value : undefined)
          }
        />
      </Flexbox>
    </Modal>
  );
});

MarkDuplicateModal.displayName = 'MarkDuplicateModal';

export default MarkDuplicateModal;
