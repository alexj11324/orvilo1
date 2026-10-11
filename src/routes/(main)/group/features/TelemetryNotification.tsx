'use client';

import { BRANDING_NAME } from '@orvilo/business-const';
import { cn } from 'cn';
import { LucideArrowUpRightFromSquare, TelescopeIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import Notification from '@/components/Notification';
import { Button } from '@/components/ui/button';
import { PRIVACY_URL } from '@/const/url';
import { useUserStore } from '@/store/user';
import { preferenceSelectors } from '@/store/user/selectors';

const styles = {
  desc: 'text-sm leading-5.5 text-muted-foreground',
  title: 'text-xl leading-7 font-semibold',
};

const TelemetryNotification = memo<{ mobile?: boolean }>(({ mobile }) => {
  const { t } = useTranslation('common');
  const isPreferenceInit = useUserStore(preferenceSelectors.isPreferenceInit);

  const [useCheckTrace, updatePreference] = useUserStore((s) => [
    s.useCheckTrace,
    s.updatePreference,
  ]);

  const { data: showModal, mutate } = useCheckTrace(isPreferenceInit);

  const updateTelemetry = (telemetry: boolean) => {
    updatePreference({ telemetry });
    mutate();
  };

  return (
    <Notification mobile={mobile} show={showModal} showCloseIcon={false}>
      <div className="flex flex-col">
        <Avatar
          avatar={<TelescopeIcon className="size-4 text-info-text" />}
          background={'var(--info-wash)'}
          size={32}
        />
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className={cn('flex flex-col', styles.title)}>
            {t('telemetry.title', { appName: BRANDING_NAME })}
          </div>
          <div className={styles.desc}>
            {t('telemetry.desc', { appName: BRANDING_NAME })}
            <span>
              <a href={PRIVACY_URL} rel="noreferrer" target="_blank">
                {t('telemetry.learnMore')}
                <LucideArrowUpRightFromSquare className="ms-1 inline-block size-4 align-middle" />
              </a>
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => {
              updateTelemetry(true);
            }}
          >
            {t('telemetry.allow')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              updateTelemetry(false);
            }}
          >
            {t('telemetry.deny')}
          </Button>
        </div>
      </div>
    </Notification>
  );
});

export default TelemetryNotification;
