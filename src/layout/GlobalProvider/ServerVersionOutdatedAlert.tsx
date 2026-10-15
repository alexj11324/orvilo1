'use client';

import { cn } from 'cn';
import { TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, buttonVariants } from '@/components/ui/button';
import { MANUAL_UPGRADE_URL } from '@/const/url';
import { CURRENT_VERSION } from '@/const/version';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';
import { useGlobalStore } from '@/store/global';

const styles = {
  closeButton: 'absolute inset-bs-5 end-5',
  container:
    'fixed inset-0 z-9999 flex items-center justify-center overflow-y-auto bg-overlay-mask p-4',
  content:
    'relative max-h-[calc(100dvh-var(--spacing)*8)] w-full max-w-120 overflow-y-auto rounded-(--radius-overlay) border border-fill-quaternary bg-card p-6 shadow-(--shadow-popover)',
  desc: 'text-sm text-muted-foreground',
  title: 'text-base font-semibold text-warning-text',
  titleIcon: 'size-4 shrink-0 text-warning-text',
  warning:
    'rounded-(--radius-card) bg-(--server-version-warning-bg) p-3 text-sm text-(color:--server-version-warning-text)',
};

const ServerVersionOutdatedAlert = () => {
  const { t } = useTranslation('common');
  const [dismissed, setDismissed] = useState(false);
  const isServerVersionOutdated = useGlobalStore((s) => s.isServerVersionOutdated);
  const isOfficialServer = useElectronStore(electronSyncSelectors.isOfficialServer);

  if (isOfficialServer || !isServerVersionOutdated || dismissed) return null;

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <Button
          aria-label={t('close')}
          className={styles.closeButton}
          size="icon"
          variant="ghost"
          onClick={() => setDismissed(true)}
        >
          <X className="size-4" />
        </Button>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 pe-12">
            <TriangleAlert className={styles.titleIcon} />
            <div className={styles.title}>{t('serverVersionOutdated.title')}</div>
          </div>

          <div className={styles.desc}>
            {t('serverVersionOutdated.desc', { version: CURRENT_VERSION })}
          </div>

          <div className={styles.warning}>{t('serverVersionOutdated.warning')}</div>

          <div className="mbs-2 flex flex-wrap justify-end gap-2">
            <a
              className={cn(buttonVariants({ size: 'default', variant: 'default' }))}
              href={MANUAL_UPGRADE_URL}
              rel="noreferrer"
              target="_blank"
            >
              {t('serverVersionOutdated.upgrade')}
            </a>
            <Button size="default" onClick={() => setDismissed(true)}>
              {t('serverVersionOutdated.dismiss')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServerVersionOutdatedAlert;
