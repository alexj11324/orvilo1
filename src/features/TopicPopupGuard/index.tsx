'use client';

import { type TopicPopupInfo } from '@orvilo/electron-client-ipc';
import { ExternalLinkIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ensureElectronIpc } from '@/utils/electron/ipc';

const styles = {
  description: 'm-0 max-w-90 text-center text-sm leading-5.5 text-muted-foreground',
  title: 'm-0 text-xl leading-7 font-semibold text-foreground',
  wrapper: 'flex h-full w-full flex-1 flex-col items-center justify-center gap-4 p-6',
};

interface TopicInPopupGuardProps {
  popup: TopicPopupInfo;
}

const TopicInPopupGuard = memo<TopicInPopupGuardProps>(({ popup }) => {
  const { t } = useTranslation('topic');

  const handleFocus = async () => {
    try {
      await ensureElectronIpc().windows.focusTopicPopup({ identifier: popup.identifier });
    } catch (error) {
      console.error('[TopicInPopupGuard] Failed to focus popup window:', error);
    }
  };

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>{t('inPopup.title')}</h2>
      <p className={styles.description}>{t('inPopup.description')}</p>
      <Button size="normal" onClick={handleFocus}>
        <ExternalLinkIcon className="size-4" data-icon="inline-start" size={16} />
        {t('inPopup.focus')}
      </Button>
    </div>
  );
});

TopicInPopupGuard.displayName = 'TopicInPopupGuard';

export default TopicInPopupGuard;
