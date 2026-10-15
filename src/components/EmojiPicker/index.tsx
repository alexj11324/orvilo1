import { lazy, memo, type ReactNode, Suspense } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { useGlobalStore } from '@/store/global';
import { globalGeneralSelectors } from '@/store/global/selectors';

import type { EmojiPickerProps } from './types';

// The native EmojiPicker bundles the emoji-mart dataset (~600 KB); load it
// on mount so the picker never sits inside a route's static closure.
const OrviloEmojiPicker = lazy(() => import('./NativeEmojiPicker'));

interface OrviloEmojiPickerProps extends EmojiPickerProps {
  /** Loading placeholder for a caller-owned custom trigger. */
  fallback?: ReactNode;
}

export const EmojiPicker = memo<OrviloEmojiPickerProps>(
  ({ fallback, shape = 'square', ...rest }) => {
    const locale = useGlobalStore(globalGeneralSelectors.currentLanguage);
    const size = rest.size ?? 40;

    return (
      <Suspense fallback={fallback ?? <Skeleton style={{ height: size, width: size }} />}>
        <OrviloEmojiPicker shape={shape} {...rest} defaultAvatar={null} locale={locale} />
      </Suspense>
    );
  },
);

export default EmojiPicker;
