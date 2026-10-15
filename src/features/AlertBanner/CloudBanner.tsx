'use client';

import { ORVILO_CLOUD, UTM_SOURCE } from '@orvilo/business-const';
import { useSize } from 'ahooks';
import { cn } from 'cn';
import { ArrowRightIcon } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import Marquee from 'react-fast-marquee';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';

import { buttonVariants } from '@/components/ui/button';
import { OFFICIAL_URL } from '@/const/url';
import { useIsDark } from '@/hooks/useIsDark';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
import { isOnServerSide } from '@/utils/env';

import gradientStyles from './CloudBanner.module.css';

export const BANNER_HEIGHT = 40;

const styles = {
  background: 'absolute h-full w-[max(64%,1280px)] opacity-80 blur-[60px]',
  containerDark: 'relative overflow-hidden bg-muted',
  containerLight: 'relative overflow-hidden bg-muted',
  wrapper: 'z-1 max-w-full overflow-hidden',
};

const CloudBanner = memo<{ mobile?: boolean }>(({ mobile }) => {
  const ref = useRef(null);
  const contentRef = useRef(null);
  const size = useSize(ref);
  const contentSize = useSize(contentRef);
  const isDarkMode = useIsDark();
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const prefersReducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const { t } = useTranslation('common');
  const [isTruncated, setIsTruncated] = useState(mobile);

  useEffect(() => {
    if (mobile || isOnServerSide || !size || !contentSize) return;
    setIsTruncated(contentSize.width > size.width - 120);
  }, [size, contentSize, mobile]);

  const content = (
    <div className="flex flex-none items-center gap-2" ref={contentRef}>
      <b>{t('alert.cloud.title', { name: ORVILO_CLOUD })}:</b>
      <span>
        {t(mobile ? 'alert.cloud.descOnMobile' : 'alert.cloud.desc', {
          credit: new Intl.NumberFormat('en-US').format(500_000),
          name: ORVILO_CLOUD,
        })}
      </span>
    </div>
  );
  return (
    <div
      ref={ref}
      style={{ height: BANNER_HEIGHT }}
      className={cn(
        'flex w-full flex-none items-center justify-center px-4 text-sm leading-5.5',
        isDarkMode ? styles.containerDark : styles.containerLight,
      )}
    >
      <div
        aria-hidden
        data-slot="cloud-banner-gradient"
        className={cn(
          styles.background,
          gradientStyles.surface,
          animationMode !== 'disabled' && !prefersReducedMotion && gradientStyles.animated,
        )}
      />
      <div className={cn('flex w-full items-center justify-center gap-4', styles.wrapper)}>
        {isTruncated ? (
          <Marquee pauseOnHover play={animationMode !== 'disabled' && !prefersReducedMotion}>
            {content}
          </Marquee>
        ) : (
          content
        )}
        <a
          className={cn(buttonVariants({ size: 'lg', variant: 'default' }))}
          href={`${OFFICIAL_URL}?utm_source=${UTM_SOURCE}&utm_medium=banner`}
          rel="noreferrer"
          target="_blank"
        >
          {t('alert.cloud.action')} <ArrowRightIcon className="size-4" size={16} />
        </a>
      </div>
    </div>
  );
});

export default CloudBanner;
