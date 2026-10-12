'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertTitle } from '@/components/ui/alert';

import { useChatInputNotice } from './useChatInputNotice';

const styles = {
  alert:
    'flex-[0_1_auto] min-w-0 w-fit max-w-[min(560px,52vw)] px-2 py-1 gap-1.5 items-center rounded-(--radius-card) text-xs leading-5 [@media(width<=768px)]:max-w-full',
  title: 'min-w-0 truncate text-xs leading-5 text-warning-text',
};

const ChatInputNotice = memo(() => {
  const { t } = useTranslation('chat');
  const notice = useChatInputNotice();

  if (!notice) return null;

  return (
    <Alert className={styles.alert} variant={notice.type}>
      <AlertTitle className={styles.title}>{t(notice.key)}</AlertTitle>
    </Alert>
  );
});

ChatInputNotice.displayName = 'ChatInputNotice';

export default ChatInputNotice;
