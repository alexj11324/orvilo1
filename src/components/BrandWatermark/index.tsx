'use client';

import { LobeHub as Orvilo } from '@lobehub/ui/brand';
import { ORG_NAME, UTM_SOURCE } from '@orvilo/business-const';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo } from 'react';

import { OFFICIAL_SITE } from '@/const/url';
import { isCustomORG } from '@/const/version';

const styles = createStaticStyles(({ css, cssVar }) => ({
  logoLink: css`
    line-height: 1;
    color: inherit;

    &:hover {
      color: ${cssVar.colorLink};
    }
  `,
}));

const BrandWatermark = memo<Omit<HTMLAttributes<HTMLDivElement>, 'children'>>(
  ({ style, ...rest }) => {
    return (
      <div
        className={'flex gap-1 items-center'}
        style={{ flex: none, color: cssVar.colorTextDescription, fontSize: 12, ...style }}
        {...rest}
      >
        <span>Powered by</span>
        {isCustomORG ? (
          <span>{ORG_NAME}</span>
        ) : (
          <a
            className={styles.logoLink}
            href={`${OFFICIAL_SITE}?utm_source=${UTM_SOURCE}&utm_content=brand_watermark`}
            rel="noreferrer"
            target="_blank"
          >
            <Orvilo size={20} type={'text'} />
          </a>
        )}
      </div>
    );
  },
);

export default BrandWatermark;
