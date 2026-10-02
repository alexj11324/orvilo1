'use client';

import { ORG_NAME } from '@orvilo/business-const';
import { cssVar } from 'antd-style';
import { type HTMLAttributes, memo } from 'react';

const BrandWatermark = memo<Omit<HTMLAttributes<HTMLDivElement>, 'children'>>(
  ({ style, ...rest }) => {
    return (
      <div
        className={'flex gap-1 items-center'}
        style={{ flex: 'none', color: cssVar.colorTextDescription, fontSize: 12, ...style }}
        {...rest}
      >
        <span>Powered by</span>
        <span>{ORG_NAME}</span>
      </div>
    );
  },
);

export default BrandWatermark;
