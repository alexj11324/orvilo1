'use client';

import { Button, confirmModal, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { Forward, Trash2, X } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { messageStateSelectors, useConversationStore, useConversationStoreApi } from '../store';
import { openForwardModal } from './ForwardModal';

const styles = createStaticStyles(({ css }) => ({
  // Full-width bar docked at the bottom in place of the composer (hidden by
  // MessageForwardFooter while selecting). Count on the leading edge, actions on
  // the trailing edge.
  bar: css`
    position: relative;

    inline-size: 100%;
    padding-block: 12px;
    padding-inline: 16px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  // Pinned to the side so the actions stay centered regardless of the count.
  count: css`
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 16px;
    transform: translateY(-50%);
  `,
}));

/**
 * Bottom action bar shown while multi-selecting: selection count on the leading
 * edge, Cancel / Delete / Forward on the trailing edge. Replaces the chat
 * composer (hidden by MessageForwardFooter).
 */
const SelectionFooterBar = memo(() => {
  const { t } = useTranslation('chat');

  const [forwardOpen, setForwardOpen] = useState(false);
  const storeApi = useConversationStoreApi();
  const selectedCount = useConversationStore(messageStateSelectors.selectedMessageCount);
  const selectedMessageIds = useConversationStore(
    messageStateSelectors.selectedDeletableMessageIds,
  );
  const exitSelectionMode = useConversationStore((s) => s.exitSelectionMode);
  const deleteMessages = useConversationStore((s) => s.deleteMessages);

  const disabled = selectedCount === 0;

  // Esc exits selection mode. When the forward dialog is open, its own Esc
  // handler closes it first — skip so a single Esc doesn't do both.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || forwardOpen) return;
      exitSelectionMode();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [forwardOpen, exitSelectionMode]);

  const handleDelete = () => {
    confirmModal({
      cancelText: t('cancel', { ns: 'common' }),
      content: t('messageForward.deleteConfirm.desc', { count: selectedCount }),
      okButtonProps: { danger: true },
      okText: t('delete', { ns: 'common' }),
      onOk: async () => {
        await deleteMessages([...selectedMessageIds]);
        exitSelectionMode();
        toast.success(t('messageForward.deleteConfirm.success', { count: selectedCount }));
      },
      title: t('messageForward.deleteConfirm.title'),
    });
  };

  const handleForward = () => {
    setForwardOpen(true);
    openForwardModal({
      createConversationStore: () => storeApi,
      onClosed: () => setForwardOpen(false),
    });
  };

  return (
    <div className={cn('flex items-center justify-center', styles.bar)}>
      <Text className={styles.count} type={'secondary'}>
        {t('messageForward.bar.selected', { count: selectedCount })}
      </Text>
      <div className="flex items-center gap-1">
        <Button icon={<X />} type={'text'} onClick={exitSelectionMode}>
          {t('messageForward.bar.cancel')}
        </Button>
        <Button danger disabled={disabled} icon={<Trash2 />} type={'text'} onClick={handleDelete}>
          {t('messageForward.bar.delete')}
        </Button>
        <Button disabled={disabled} icon={<Forward />} type={'text'} onClick={handleForward}>
          {t('messageForward.bar.forward')}
        </Button>
      </div>
    </div>
  );
});

SelectionFooterBar.displayName = 'MessageForwardSelectionFooterBar';

export default SelectionFooterBar;
