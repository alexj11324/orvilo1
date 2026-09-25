'use client';

import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';
import { FluentEmoji } from '@lobehub/ui';
import type { AvatarProps as OrviloAvatarProps } from '@lobehub/ui/base-ui';
import { cssVar, cx } from 'antd-style';
import { type ComponentProps, isValidElement, memo, type ReactNode } from 'react';

import { remoteAvatarSrc, resolveAvatar } from './fallback';
import { useBrokenSrc } from './useBrokenSrc';

const EMOJI_RE = /^\p{Extended_Pictographic}/u;

type AvatarRootElementProps = Omit<ComponentProps<'span'>, 'children' | 'title'>;

export interface AvatarProps
  extends Omit<OrviloAvatarProps, keyof ComponentProps<'div'>>, AvatarRootElementProps {
  children?: ReactNode;
  /** Accepted for compatibility with legacy callers; the tile has a single slot. */
  gap?: number;
  /** Accepted for compatibility with legacy callers; pass the node via `avatar`. */
  icon?: ReactNode;
  /**
   * Person/entity display name. When the image URL is missing or fails to load,
   * the tile falls back to these initials so the avatar still carries identity.
   */
  name?: string;
  /** Image URL; alias of `avatar` for `<img>`-style callers. */
  src?: string;
  srcSet?: string;
  title?: string;
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
    animation,
    avatar,
    background,
    bordered,
    borderedColor,
    children,
    className,
    emojiScaleWithBackground,
    gap,
    icon,
    loading,
    name,
    shadow,
    shape,
    size = 48,
    sliceText,
    src: srcProp,
    srcSet,
    style,
    title,
    tooltipProps,
    unoptimized,
    variant,
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
        <FluentEmoji
          emoji={resolved.avatar}
          size={Math.round(numericSize * 0.72)}
          type={animation ? 'anim' : undefined}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            color: cssVar.colorText,
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
        className={cx('orvilo-avatar', className)}
        title={title}
        style={{
          alignItems: 'center',
          background: resolved.background ?? cssVar.colorBorder,
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
