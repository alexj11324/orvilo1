'use client';

import { BRANDING_NAME } from '@orvilo/business-const';
import { createStaticStyles } from 'antd-style';
import { MessageSquareHeart } from 'lucide-react';
import { type PropsWithChildren } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { createGuideModal } from '@/components/GuideModal';
import GuideVideo from '@/components/GuideVideo';
import { GITHUB, GITHUB_ISSUES } from '@/const/url';
import { useServerConfigStore } from '@/store/serverConfig';
import { isOnServerSide } from '@/utils/env';

const styles = createStaticStyles(
  ({ css, cssVar }) => css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
);

export const LayoutSettingsFooterClassName = 'settings-layout-footer';

const Footer = memo<PropsWithChildren>(() => {
  const { t } = useTranslation('common');

  const hideGitHubEngagementFooter = useServerConfigStore((s) =>
    Boolean(s.featureFlags.hideGitHub || s.serverConfig.enableBusinessFeatures),
  );

  const handleOpenStar = () =>
    createGuideModal({
      cancelText: t('footer.later'),
      cover: (
        <GuideVideo
          height={269}
          src={`https://hub-apac-1.objects.aspectlylabs.com/assets/star.mp4`}
          width={358}
        />
      ),
      desc: t('footer.star.desc'),
      okText: t('footer.star.action'),
      onOk: () => {
        if (isOnServerSide) return;
        window.open(GITHUB, '_blank', 'noopener,noreferrer');
      },
      title: t('footer.star.title'),
    });

  const handleOpenFeedback = () =>
    createGuideModal({
      cancelText: t('footer.later'),
      cover: (
        <GuideVideo
          height={269}
          width={358}
          src={
            '<@985522149420855317> https://hub-apac-1.objects.aspectlylabs.com/assets/feedback.mp4'
          }
        />
      ),
      desc: t('footer.feedback.desc', { appName: BRANDING_NAME }),
      okText: t('footer.feedback.action'),
      onOk: () => {
        if (isOnServerSide) return;
        window.open(GITHUB_ISSUES, '_blank', 'noopener,noreferrer');
      },
      title: t('footer.feedback.title'),
    });

  return hideGitHubEngagementFooter ? null : (
    <div className={`flex flex-col justify-end ${LayoutSettingsFooterClassName}`}>
      <footer
        className={`flex items-center justify-center flex-none w-full ${styles}`}
        style={{ padding: 16 }}
      >
        <div style={{ textAlign: 'center' }}>
          <MessageSquareHeart /> {`${t('footer.title')} `}
          <a
            href={GITHUB}
            onClick={(e) => {
              e.preventDefault();
              handleOpenStar();
            }}
          >
            {t('footer.action.star')}
          </a>
          {` ${t('footer.and')} `}
          <a
            href={GITHUB_ISSUES}
            onClick={(e) => {
              e.preventDefault();
              handleOpenFeedback();
            }}
          >
            {t('footer.action.feedback')}
          </a>
          {' !'}
        </div>
      </footer>
    </div>
  );
});

Footer.displayName = 'SettingFooter';

export default Footer;
