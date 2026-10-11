'use client';

import { BRANDING_NAME } from '@orvilo/business-const';
import { cn } from 'cn';
import { memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import { PRIVACY_URL, TERMS_URL } from '@/const/url';
import AuthCard from '@/features/AuthCard';
import { useIsDark } from '@/hooks/useIsDark';

import type { MarketAuthScene } from './scenes';

const styles = {
  container:
    'pbs-8 bg-[url(/app-images/community_header_light.webp)] bg-no-repeat [background-position:400%_0] [background-size:calc(var(--spacing)*100)_auto] bg-blend-multiply',
  container_dark: 'bg-[url(/app-images/community_header_dark.webp)] bg-blend-screen',
};

interface MarketAuthConfirmModalProps {
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  scene?: MarketAuthScene;
}

const MarketAuthConfirmModal = memo<MarketAuthConfirmModalProps>(
  ({ open, onConfirm, onCancel, scene = 'default' }) => {
    const { t } = useTranslation('marketAuth');
    const isDarkMode = useIsDark();

    // Resolve scene-specific copy, falling back to the generic community-profile
    // wording when a scene has no dedicated key.
    const ts = (key: string, options?: Record<string, unknown>): string => {
      const fallback = t(`authorize.${key}` as any, options as any) as string;
      if (scene === 'default') return fallback;
      return t(
        `authorize.scenes.${scene}.${key}` as any,
        {
          ...options,
          defaultValue: fallback,
        } as any,
      ) as string;
    };

    const footer = (
      <div className="text-center text-xs leading-5 text-muted-foreground">
        <Trans
          i18nKey={'authorize.footer.agreement'}
          ns={'marketAuth'}
          components={{
            privacy: (
              <a className="cursor-pointer text-inherit underline" href={PRIVACY_URL}>
                {t('authorize.footer.terms')}
              </a>
            ),
            terms: (
              <a className="cursor-pointer text-inherit underline" href={TERMS_URL}>
                {t('authorize.footer.privacy')}
              </a>
            ),
          }}
        />
      </div>
    );
    return (
      <ImperativeModal
        centered
        cancelText={ts('cancel')}
        okText={ts('confirm')}
        open={open}
        title={null}
        width={440}
        classNames={{
          wrapper: cn(styles.container, isDarkMode && styles.container_dark),
        }}
        paddings={{
          desktop: 24,
        }}
        onCancel={onCancel}
        onOk={onConfirm}
      >
        <AuthCard
          className="pbs-10 pbe-5"
          footer={footer}
          style={{ width: '100%' }}
          subtitle={ts('subtitle')}
          title={ts('title')}
        >
          <div className="rounded-(--radius-card) bg-accent p-4">
            <div className="text-center text-sm leading-5.5">
              {ts('description', { appName: BRANDING_NAME })}
            </div>
          </div>
        </AuthCard>
      </ImperativeModal>
    );
  },
);

MarketAuthConfirmModal.displayName = 'MarketAuthConfirmModal';

export default MarketAuthConfirmModal;
