'use client';

import { type FlexboxProps } from '@lobehub/ui';
import { Flexbox } from '@lobehub/ui';
import { LobeHub } from '@lobehub/ui/brand';
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

const BrandWatermark = memo<Omit<FlexboxProps, 'children'>>(({ style, ...rest }) => {
  return (
    <Flexbox
      horizontal
      align={'center'}
      dir={'ltr'}
      flex={'none'}
      gap={4}
      style={{ color: cssVar.colorTextDescription, fontSize: 12, ...style }}
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
          <LobeHub size={20} type={'text'} />
        </a>
      )}
    </Flexbox>
  );
});

export default BrandWatermark;
