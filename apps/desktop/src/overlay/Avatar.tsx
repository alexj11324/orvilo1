import { memo } from 'react';

import * as styles from './avatar.css.ts';

export interface OverlayAvatarProps {
  avatar?: string | null;
  background?: string | null;
  size?: number;
  title?: string | null;
}

const URL_PATTERN = /^(?:blob:|data:|file:|https?:|\/|\.\.?\/)/;

const EMOJI_RE = /^\p{Extended_Pictographic}/u;

const isUrl = (value: string) => URL_PATTERN.test(value);

const firstGlyph = (value?: string | null) => {
  if (!value) return '?';
  const trimmed = value.trim();
  return trimmed ? (Array.from(trimmed)[0] ?? '?') : '?';
};

const OverlayAvatar = memo<OverlayAvatarProps>(({ avatar, background, size = 18, title }) => {
  const boxStyle = {
    background: background ?? undefined,
    height: size,
    width: size,
  };

  if (avatar && EMOJI_RE.test(avatar)) {
    // Native emoji text, matching how the web Avatar renders emoji avatars.
    return (
      <span
        className={styles.emojiBox}
        style={{ ...boxStyle, fontSize: Math.round(size * 0.82), lineHeight: 1 }}
      >
        {avatar}
      </span>
    );
  }

  if (avatar && isUrl(avatar)) {
    return (
      <img
        alt={title ?? 'avatar'}
        className={styles.image}
        draggable={false}
        src={avatar}
        style={boxStyle}
      />
    );
  }

  return (
    <span className={styles.textBox} style={boxStyle}>
      {firstGlyph(title ?? avatar)}
    </span>
  );
});

export default OverlayAvatar;
