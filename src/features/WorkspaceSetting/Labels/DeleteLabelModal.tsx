import { type AgentLabelListItem } from '@orvilo/types';
import { t as translate } from 'i18next';
import { Loader2 } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, ModalFooter, useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHomeStore } from '@/store/home';

/** The word the user must type to arm the Delete button (mirrors Linear). */
const DELETE_CONFIRM_WORD = 'delete';

interface DeleteLabelContentProps {
  label: AgentLabelListItem;
}

/**
 * Destructive-delete confirm: deleting removes the label from every agent and
 * cannot be undone, so the modal requires typing `delete` and offers Archive
 * as the reversible alternative (mirrors the Linear flow in the issue spec).
 */
const DeleteLabelContent = memo<DeleteLabelContentProps>(({ label }) => {
  const { t } = useTranslation(['setting', 'common']);
  const { close } = useModalContext();
  const [removeAgentLabel, updateAgentLabel] = useHomeStore((s) => [
    s.removeAgentLabel,
    s.updateAgentLabel,
  ]);

  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const armed = confirmText.trim().toLowerCase() === DELETE_CONFIRM_WORD;

  const handleDelete = async () => {
    if (!armed || loading || archiving) return;
    setLoading(true);
    try {
      await removeAgentLabel(label.id);
      toast.success(t('workspaceSetting.labels.delete.success'));
      close();
    } catch (error) {
      console.error('Failed to delete label:', error);
      toast.error(t('operationFailed', { ns: 'common' }));
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    if (loading || archiving) return;
    setArchiving(true);
    try {
      await updateAgentLabel(label.id, { archived: true });
      toast.success(t('workspaceSetting.labels.archive.success'));
      close();
    } catch (error) {
      console.error('Failed to archive label:', error);
      toast.error(t('operationFailed', { ns: 'common' }));
    } finally {
      setArchiving(false);
    }
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          paddingBlock: 8,
          paddingInline: 16,
        }}
      >
        <span>
          {label.usageCount > 0
            ? t('workspaceSetting.labels.delete.descUsed', { count: label.usageCount })
            : t('workspaceSetting.labels.delete.desc')}
        </span>
        <span style={{ color: 'var(--muted-foreground)' }}>
          {t('workspaceSetting.labels.delete.archiveHint')}
        </span>
        <span>{t('workspaceSetting.labels.delete.confirmHint')}</span>
        <Input
          autoFocus
          disabled={loading || archiving}
          placeholder={DELETE_CONFIRM_WORD}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) void handleDelete();
          }}
        />
      </div>
      {/* Archive and Delete both mutate the same label, so each locks the other
          out — `loading` alone only disables the button that owns it. */}
      <ModalFooter style={{ justifyContent: 'space-between' }}>
        <Button
          aria-busy={archiving}
          disabled={loading || archiving}
          variant="outline"
          onClick={handleArchive}
        >
          {archiving && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {t('workspaceSetting.labels.actions.archive')}
        </Button>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
          <Button variant="outline" onClick={close}>
            {t('cancel', { ns: 'common' })}
          </Button>
          <Button
            aria-busy={loading}
            disabled={!armed || archiving || loading}
            variant="destructive"
            onClick={handleDelete}
          >
            {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {t('delete', { ns: 'common' })}
          </Button>
        </div>
      </ModalFooter>
    </>
  );
});

DeleteLabelContent.displayName = 'DeleteLabelContent';

export const openDeleteLabelModal = (label: AgentLabelListItem) =>
  createModal({
    content: <DeleteLabelContent label={label} />,
    footer: null,
    styles: { content: { padding: 0 } },
    title: translate('workspaceSetting.labels.delete.title', { name: label.name, ns: 'setting' }),
    width: 460,
  });
