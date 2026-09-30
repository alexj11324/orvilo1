'use client';

import { lobeStaticStylish } from '@lobehub/ui';
import { ORVILO_CLOUD, UTM_SOURCE } from '@orvilo/business-const';
import { useSize } from 'ahooks';
import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { ArrowRightIcon } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import Marquee from 'react-fast-marquee';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { OFFICIAL_URL } from '@/const/url';
import { useIsDark } from '@/hooks/useIsDark';
import { isOnServerSide } from '@/utils/env';

export const BANNER_HEIGHT = 40;

const styles = createStaticStyles(({ css, cssVar }) => ({
  background: cx(
    lobeStaticStylish.gradientAnimation,
    css`
      position: absolute;

      width: max(64%, 1280px);
      height: 100%;

      opacity: 0.8;
      filter: blur(60px);
    `,
  ),
  containerDark: css`
    position: relative;
    overflow: hidden;
    background-color: ${cssVar.colorFill};
  `,
  containerLight: css`
    position: relative;
    overflow: hidden;
    background-color: ${cssVar.colorFillSecondary};
  `,
  wrapper: css`
    z-index: 1;
    overflow: hidden;
    max-width: 100%;
  `,
}));

const CloudBanner = memo<{ mobile?: boolean }>(({ mobile }) => {
  const ref = useRef(null);
  const contentRef = useRef(null);
  const size = useSize(ref);
  const contentSize = useSize(contentRef);
  const isDarkMode = useIsDark();
  const { t } = useTranslation('common');
  const [isTruncated, setIsTruncated] = useState(mobile);

  useEffect(() => {
    if (mobile || isOnServerSide || !size || !contentSize) return;
    setIsTruncated(contentSize.width > size.width - 120);
  }, [size, contentSize, mobile]);

  const content = (
    <div className="flex items-center gap-2" ref={contentRef} style={{ flex: 'none' }}>
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
      style={{ flex: 'none', height: BANNER_HEIGHT, width: '100%' }}
      className={cn(
        'flex items-center justify-center px-4',
        isDarkMode ? styles.containerDark : styles.containerLight,
      )}
    >
      <div className={styles.background} />
      <div
        className={cn('flex items-center justify-center gap-4', styles.wrapper)}
        style={{ width: '100%' }}
      >
        {isTruncated ? <Marquee pauseOnHover>{content}</Marquee> : content}
        <a
          href={`${OFFICIAL_URL}?utm_source=${UTM_SOURCE}&utm_medium=banner`}
          rel="noreferrer"
          target="_blank"
        >
          <Button size="sm" variant="default">
            {t('alert.cloud.action')} <ArrowRightIcon />
          </Button>
        </a>
      </div>
    </div>
  );
});

export default CloudBanner;
