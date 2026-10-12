'use client';

import { SiDiscord, SiGithub, SiX, SiYoutube } from '@icons-pack/react-simple-icons';
import { BRANDING_EMAIL, BRANDING_NAME, SOCIAL_URL } from '@orvilo/business-const';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Separator } from '@/components/ui/separator';
import { DOWNLOAD_URL, mailTo, OFFICIAL_SITE } from '@/const/url';
import { settingWidthClassNames } from '@/features/Setting/settingWidth';
import { getHostContext } from '@/platform';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

import AboutList from './AboutList';
import ItemCard from './ItemCard';
import ItemLink from './ItemLink';
import Version from './Version';

const styles = {
  title: 'text-base leading-6 font-semibold text-muted-foreground',
};

const About = memo<{ mobile?: boolean }>(({ mobile }) => {
  const { t } = useTranslation('common');
  // The download entry only makes sense on web; the desktop app is already installed.
  const inDesktopApp = getHostContext().kind === 'desktop';
  // The hosted site is a promotion target, so it follows the promotion flag.
  const { showCloudPromotion } = useServerConfigStore(featureFlagsSelectors);

  return (
    <section className={`flex w-full min-w-0 flex-col gap-4 ${settingWidthClassNames.form}`}>
      <h2 className="text-sm leading-5.5 font-semibold text-foreground">
        {`${t('about')} ${BRANDING_NAME}`}
      </h2>
      <div className="flex flex-col gap-2 rounded-(--radius-card) bg-secondary p-4">
        <div className="flex w-full min-w-0 flex-col gap-5 py-5">
          <Version mobile={mobile} />
          <Separator className="my-0" />
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
          <Separator className="my-0" />
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
              <Separator className="my-0" />
            </>
          )}
          <div className={styles.title}>{t('contact')}</div>
          <AboutList
            ItemRender={ItemLink}
            items={[
              {
                href: showCloudPromotion ? OFFICIAL_SITE : undefined,
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
      </div>
    </section>
  );
});

export default About;
