'use client';

import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/**
 * Add a Task to a running goal. A task the coordinator will spend rounds on
 * deserves a titled brief, not a one-line inline input — the modal gives the
 * instruction room and keeps the frontier list itself read-focused.
 */

export interface AddTaskContentProps {
  onAdd: (title: string, description?: string) => Promise<void>;
}

const AddTaskContent = memo<AddTaskContentProps>(({ onAdd }) => {
  const { t } = useTranslation('chat');
  const { close } = useModalContext();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onAdd(trimmed, description.trim() || undefined);
      close();
    } catch (error) {
      // Keep the form (and the user's input) open — a silent close would be
      // indistinguishable from success.
      console.error('[AddGoalTask] Failed to add task:', error);
      toast.error(t('goalProcess.addTask.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" style={{ paddingBlock: '4px 8px' }}>
      <div className="flex flex-col gap-1.5">
        <div className="text-[13px] font-medium">{t('goalProcess.addTask.titleLabel')}</div>
        <Input
          autoFocus
          placeholder={t('goalProcess.addTask.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[13px] font-medium">{t('goalProcess.addTask.descriptionLabel')}</div>
        <Textarea
          placeholder={t('goalProcess.addTask.descriptionPlaceholder')}
          rows={3}
          style={{ maxHeight: '8lh' }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button onClick={() => close()}>{t('cancel', { ns: 'common' })}</Button>
        <Button
          disabled={!title.trim()}
          loading={busy}
          variant="outline"
          onClick={() => void submit()}
        >
          {t('goalProcess.frontier.add')}
        </Button>
      </div>
    </div>
  );
});

AddTaskContent.displayName = 'AddGoalTaskContent';

export default AddTaskContent;
