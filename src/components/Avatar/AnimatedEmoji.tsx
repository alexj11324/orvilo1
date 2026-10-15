'use client';

import { useMediaQuery } from 'react-responsive';

import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import { animatedEmojiUrl } from './animatedEmojiUrl';
import { useBrokenSrc } from './useBrokenSrc';

/** Mounted only for callers requesting animated emoji; other tiles do not subscribe. */
const AnimatedEmoji = ({ emoji, size }: { emoji: string; size: number }) => {
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const reducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const src = animatedEmojiUrl(emoji);
  const [broken, markBroken] = useBrokenSrc(src);
  if (animationMode === 'disabled' || reducedMotion || broken) {
    return (
      <span aria-label={emoji} role="img" style={{ fontSize: size * 0.72, lineHeight: 1 }}>
        {emoji}
      </span>
    );
  }
  return (
    <img alt={emoji} height={size} loading="lazy" src={src} width={size} onError={markBroken} />
  );
};

export default AnimatedEmoji;
