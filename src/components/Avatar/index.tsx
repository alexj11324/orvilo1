'use client';

import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';
import { cn } from 'cn';
import { type ComponentProps, isValidElement, memo, type ReactNode } from 'react';

import { remoteAvatarSrc, resolveAvatar } from './fallback';
import { useBrokenSrc } from './useBrokenSrc';

const EMOJI_RE = /^\p{Extended_Pictographic}/u;

type AvatarRootElementProps = Omit<ComponentProps<'span'>, 'children' | 'title'>;

export interface AvatarProps extends AvatarRootElementProps {
  /** Alias for the native `alt` attribute of the rendered image. */
  alt?: string;
  /** Play the animated emoji variant instead of the static one. */
  animation?: boolean;
  /** Avatar content: an image URL, an emoji, or a custom React node. */
  avatar?: string | ReactNode;
  /** Background color, ignored when the avatar is an image or a custom node. */
  background?: string;
  /** Show the outer ring. */
  bordered?: boolean;
  /** Custom color for the outer ring. */
  borderedColor?: string;
  children?: ReactNode;
  /** Native `draggable` attribute of the rendered image. */
  draggable?: boolean;
  /** Scale the emoji down when a background color is present. */
  emojiScaleWithBackground?: boolean;
  /** Accepted for compatibility with legacy callers; the tile has a single slot. */
  gap?: number;
  /** Accepted for compatibility with legacy callers; pass the node via `avatar`. */
  icon?: ReactNode;
  /** Show the full-size loading overlay. */
  loading?: boolean;
  /**
   * Person/entity display name. When the image URL is missing or fails to load,
   * the tile falls back to these initials so the avatar still carries identity.
   */
  name?: string;
  /** Apply a drop shadow. */
  shadow?: boolean;
  /** `'square'` keeps the rounded-square entity tile; `'circle'` is the default person tile. */
  shape?: 'circle' | 'square';
  /** Width and height in pixels. */
  size?: number;
  /** Slice fallback text to its first characters. */
  sliceText?: boolean;
  /** Image URL; alias of `avatar` for `<img>`-style callers. */
  src?: string;
  srcSet?: string;
  title?: string;
  /** Reserved for tooltip integration; not rendered yet. */
  tooltipProps?: Record<string, unknown>;
  /** Accepted for compatibility with next/image-based avatars; has no effect on the native img. */
  unoptimized?: boolean;
  /** Visual variant. */
  variant?: 'borderless' | 'filled' | 'outlined';
}

/**
 * Shared avatar tile. `size` stays a pixel number; `shape="square"` keeps the
 * rounded-square entity tile (agents, skills, pages), everything else renders
 * the circular person avatar. Image failures fall back to initials via
 * `useBrokenSrc` + `resolveAvatar`, so callers never see a broken image icon.
 */
const Avatar = memo<AvatarProps>(
  ({
    alt,
    animation: _animation,
    avatar,
    background,
    bordered: _bordered,
    borderedColor: _borderedColor,
    children,
    className,
    emojiScaleWithBackground: _emojiScaleWithBackground,
    gap: _gap,
    icon: _icon,
    loading: _loading,
    name,
    shadow: _shadow,
    shape,
    size = 48,
    sliceText: _sliceText,
    src: srcProp,
    srcSet: _srcSet,
    style,
    title,
    tooltipProps: _tooltipProps,
    unoptimized: _unoptimized,
    variant: _variant,
    ...rest
  }) => {
    const src = remoteAvatarSrc(avatar) ?? remoteAvatarSrc(srcProp);
    const [isBroken, markBroken] = useBrokenSrc(src);
    const resolved = resolveAvatar({ avatar, background, isBroken, name, title });
    const numericSize = typeof size === 'number' ? size : Number.parseFloat(size) || 48;
    const imgAlt = alt ?? title ?? name ?? '';

    const borderRadius =
      shape === 'square' ? Math.max(4, Math.round(numericSize * 0.22)) : numericSize / 2;

    let content: ReactNode;
    if (src && !isBroken) {
      content = (
        <img
          alt={imgAlt}
          height={numericSize}
          loading="lazy"
          src={src}
          width={numericSize}
          style={{
            borderRadius,
            display: 'block',
            height: '100%',
            objectFit: 'cover',
            width: '100%',
          }}
          onError={markBroken}
        />
      );
    } else if (isValidElement(resolved.avatar)) {
      content = resolved.avatar;
    } else if (typeof resolved.avatar === 'string' && resolved.avatar) {
      // A non-URL string is either an emoji identity (pages, connectors) or the
      // initials produced by the fallback above.
      content = EMOJI_RE.test(resolved.avatar) ? (
        <span
          aria-label={resolved.avatar}
          role={'img'}
          style={{ fontSize: Math.round(numericSize * 0.72), lineHeight: 1 }}
        >
          {resolved.avatar}
        </span>
      ) : (
        <span
          aria-hidden="true"
          style={{
            color: 'var(--foreground)',
            fontSize: Math.max(9, Math.round(numericSize * 0.38)),
            fontWeight: 500,
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {resolved.avatar}
        </span>
      );
    } else {
      content = children;
    }

    return (
      <AvatarPrimitive.Root
        {...rest}
        aria-label={imgAlt || (rest['aria-label'] as string | undefined)}
        className={cn('orvilo-avatar', className)}
        title={title}
        style={{
          alignItems: 'center',
          background: resolved.background ?? 'var(--border)',
          borderRadius,
          display: 'inline-flex',
          flexShrink: 0,
          height: numericSize,
          justifyContent: 'center',
          overflow: 'hidden',
          width: numericSize,
          ...style,
        }}
      >
        {content}
      </AvatarPrimitive.Root>
    );
  },
);
Avatar.displayName = 'Avatar';

export default Avatar;
