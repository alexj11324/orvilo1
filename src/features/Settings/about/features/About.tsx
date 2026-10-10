'use client';

import { SiDiscord, SiGithub, SiX, SiYoutube } from '@icons-pack/react-simple-icons';
import { BRANDING_EMAIL, BRANDING_NAME, SOCIAL_URL } from '@orvilo/business-const';
import { createStaticStyles } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Form from '@/components/GroupForm';
import { Separator } from '@/components/ui/separator';
import { DOWNLOAD_URL, mailTo, OFFICIAL_SITE } from '@/const/url';
import { getHostContext } from '@/platform';

import AboutList from './AboutList';
import ItemCard from './ItemCard';
import ItemLink from './ItemLink';
import Version from './Version';

const styles = createStaticStyles(({ css, cssVar }) => ({
  title: css`
    font-size: 14px;
    font-weight: bold;
    color: ${cssVar.colorTextSecondary};
  `,
}));

const About = memo<{ mobile?: boolean }>(({ mobile }) => {
  const { t } = useTranslation('common');
  // The download entry only makes sense on web; the desktop app is already installed.
  const inDesktopApp = getHostContext().kind === 'desktop';

  return (
    <Form.Group
      collapsible={false}
      gap={16}
      style={{ width: '100%' }}
      title={`${t('about')} ${BRANDING_NAME}`}
      variant={'filled'}
    >
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'column', gap: 20, width: '100%', paddingBlock: 20 }}
      >
        <Version mobile={mobile} />
        <Separator style={{ marginBlock: 0 }} />
        <AboutList
          grid
          ItemRender={ItemCard}
          items={[
            {
              href: SOCIAL_URL.github,
              icon: SiGithub,
              label: 'GitHub',
              value: 'feedback',
            },
            {
              href: SOCIAL_URL.discord,
              icon: SiDiscord,
              label: 'Discord',
              value: 'discord',
            },
            {
              href: SOCIAL_URL.x,
              icon: SiX as any,
              label: 'X / Twitter',
              value: 'x',
            },

            {
              href: SOCIAL_URL.youtube,
              icon: SiYoutube,
              label: 'YouTube',
              value: 'youtube',
            },
          ]}
        />
        <Separator style={{ marginBlock: 0 }} />
        {!inDesktopApp && (
          <>
            <div className={styles.title}>{t('getApp')}</div>
            <AboutList
              ItemRender={ItemLink}
              items={[
                {
                  href: DOWNLOAD_URL.default,
                  label: t('getDesktopApp'),
                  value: 'desktop',
                },
              ]}
            />
            <Separator style={{ marginBlock: 0 }} />
          </>
        )}
        <div className={styles.title}>{t('contact')}</div>
        <AboutList
          ItemRender={ItemLink}
          items={[
            {
              href: OFFICIAL_SITE,
              label: t('officialSite'),
              value: 'officialSite',
            },
            {
              href: BRANDING_EMAIL.support ? mailTo(BRANDING_EMAIL.support) : undefined,
              label: t('mail.support'),
              value: 'support',
            },
            {
              href: BRANDING_EMAIL.business ? mailTo(BRANDING_EMAIL.business) : undefined,
              label: t('mail.business'),
              value: 'business',
            },
          ]}
        />
      </div>
    </Form.Group>
  );
});

export default About;
