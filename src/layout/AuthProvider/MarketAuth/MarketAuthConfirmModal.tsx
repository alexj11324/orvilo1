'use client';

import { BRANDING_NAME } from '@orvilo/business-const';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import { PRIVACY_URL, TERMS_URL } from '@/const/url';
import AuthCard from '@/features/AuthCard';
import { useIsDark } from '@/hooks/useIsDark';

import type { MarketAuthScene } from './scenes';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    padding-block-start: 32px;

    background-image: url('/app-images/community_header_light.webp');
    background-repeat: no-repeat;
    background-position: 400% 0;
    background-size: 400px auto;
    background-blend-mode: multiply;
  `,
  container_dark: css`
    background-image: url('/app-images/community_header_dark.webp');
    background-blend-mode: screen;
  `,
}));

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
      <div className="text-center text-[13px] text-muted-foreground">
        <Trans
          i18nKey={'authorize.footer.agreement'}
          ns={'marketAuth'}
          components={{
            privacy: (
              <a
                href={PRIVACY_URL}
                style={{ color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {t('authorize.footer.terms')}
              </a>
            ),
            terms: (
              <a
                href={TERMS_URL}
                style={{ color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
              >
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
          container: cx(styles.container, isDarkMode && styles.container_dark),
        }}
        paddings={{
          desktop: 24,
        }}
        onCancel={onCancel}
        onOk={onConfirm}
      >
        <AuthCard
          footer={footer}
          style={{ paddingBlock: '40px 20px', width: '100%' }}
          subtitle={ts('subtitle')}
          title={ts('title')}
        >
          <div
            style={{
              background: cssVar.colorFillTertiary,
              borderRadius: cssVar.borderRadius,
              padding: 16,
            }}
          >
            <div className="text-center">{ts('description', { appName: BRANDING_NAME })}</div>
          </div>
        </AuthCard>
      </ImperativeModal>
    );
  },
);

MarketAuthConfirmModal.displayName = 'MarketAuthConfirmModal';

export default MarketAuthConfirmModal;
