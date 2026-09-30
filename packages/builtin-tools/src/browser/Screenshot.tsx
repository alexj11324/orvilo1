import { Image } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { memo } from 'react';

import { resolveScreenshotSrc } from './screenshotSrc';
import type { BrowserScreenshotState } from './types';

/** Screenshot: render the capture inline for the user. */
const Screenshot = memo<BuiltinRenderProps<unknown, BrowserScreenshotState, string>>(
  ({ pluginState }) => {
    const src = resolveScreenshotSrc(pluginState);
    if (!src) return null;

    return (
      <div
        style={{
          overflow: 'hidden',
          padding: 4,
          background: cssVar.colorBgContainer,
          border: `1px solid ${cssVar.colorBorderSecondary}`,
          borderRadius: cssVar.borderRadius,
        }}
      >
        <Image alt={'Browser screenshot'} src={src} style={{ borderRadius: 4, width: '100%' }} />
      </div>
    );
  },
);

Screenshot.displayName = 'BrowserScreenshot';

export default Screenshot;
