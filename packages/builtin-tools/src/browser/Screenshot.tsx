import { Image } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
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
          background: 'var(--card)',
          border: `1px solid ${'var(--divider)'}`,
          borderRadius: 'var(--radius-card)',
        }}
      >
        <Image alt={'Browser screenshot'} src={src} style={{ borderRadius: 4, width: '100%' }} />
      </div>
    );
  },
);

Screenshot.displayName = 'BrowserScreenshot';

export default Screenshot;
