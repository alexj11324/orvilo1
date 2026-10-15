import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import { Image } from '@/components/ImagePreview';

import { resolveScreenshotSrc } from './screenshotSrc';
import type { BrowserScreenshotState } from './types';

/** Screenshot: render the capture inline for the user. */
const Screenshot = memo<BuiltinRenderProps<unknown, BrowserScreenshotState, string>>(
  ({ pluginState }) => {
    const src = resolveScreenshotSrc(pluginState);
    if (!src) return null;

    return (
      <div className="overflow-hidden rounded-(--radius-card) border border-divider bg-card p-1">
        <Image alt={'Browser screenshot'} className="w-full rounded-(--radius-chip)" src={src} />
      </div>
    );
  },
);

Screenshot.displayName = 'BrowserScreenshot';

export default Screenshot;
