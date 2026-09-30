'use client';

import { t } from 'i18next';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ModalInstance } from '@/components/Modal';
import { createModal, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import type { TrayCheck } from './types';

interface EditContentProps {
  /** Existing check to edit; undefined = authoring a new one. */
  initial?: TrayCheck;
  onRemove?: () => void;
  onSubmit: (value: { method: string; name: string }) => void | Promise<unknown>;
}

const EditContent = memo<EditContentProps>(({ initial, onRemove, onSubmit }) => {
  const { t: tv } = useTranslation('verify');
  const { close } = useModalContext();
  const [name, setName] = useState(initial?.name ?? '');
  const [method, setMethod] = useState(initial?.method ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      // Only close once the write lands; a failed save keeps the modal open.
      await onSubmit({ method: method.trim(), name: trimmed });
      close();
    } catch {
      // The caller already rolled back the optimistic value and toasted.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="text-[12px] text-muted-foreground">
          {tv('acceptance.tray.editModal.nameLabel')}
        </div>
        <Input
          placeholder={tv('acceptance.tray.editModal.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[12px] text-muted-foreground">
          {tv('acceptance.tray.editModal.methodLabel')}
        </div>
        <Textarea
          placeholder={tv('acceptance.tray.editModal.methodPlaceholder')}
          rows={2}
          style={{ maxHeight: '4lh' }}
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between">
        {onRemove ? (
          <Button
            variant="destructive"
            onClick={() => {
              onRemove();
              close();
            }}
          >
            {tv('acceptance.tray.editModal.remove')}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button disabled={saving} onClick={close}>
            {tv('acceptance.actions.cancel')}
          </Button>
          <Button
            disabled={!name.trim() || saving}
            loading={saving}
            variant="default"
            onClick={handleSave}
          >
            {tv('acceptance.tray.editModal.save')}
          </Button>
        </div>
      </div>
    </div>
  );
});

EditContent.displayName = 'VerifyTrayEditContent';

export const openCheckEditModal = (options: EditContentProps): ModalInstance =>
  createModal({
    content: <EditContent {...options} />,
    footer: null,
    maskClosable: true,
    title: options.initial
      ? t('acceptance.tray.editModal.editTitle', { ns: 'verify' })
      : t('acceptance.tray.editModal.addTitle', { ns: 'verify' }),
    width: 'min(90vw, 520px)',
  });
