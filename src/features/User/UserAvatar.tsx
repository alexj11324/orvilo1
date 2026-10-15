'use client';

import { BRANDING_NAME } from '@orvilo/business-const';
import { cn } from 'cn';
import { useMemo } from 'react';
import { useMediaQuery } from 'react-responsive';

import type { AvatarProps } from '@/components/Avatar';
import Avatar from '@/components/Avatar';
import { remoteAvatarSrc } from '@/components/Avatar/fallback';
import { DEFAULT_USER_AVATAR_URL } from '@/const/meta';
import { isDesktop } from '@/const/version';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';
import { useUserStore } from '@/store/user';
import {
  authSelectors,
  userGeneralSettingsSelectors,
  userProfileSelectors,
} from '@/store/user/selectors';

const styles = {
  avatar: 'flex-none border border-divider font-sans text-foreground',
  // Identity artwork stays still; the ring describes the clickable UI frame.
  clickable:
    'relative hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  transition:
    'transition-[box-shadow] duration-(--orvilo-motion-mid) ease-out motion-reduce:transition-none',
} as const;

export interface UserAvatarProps extends AvatarProps {
  /**
   * Override the avatar URL/emoji — used when the component is acting as a
   * generic "active identity" avatar (e.g. showing the active team workspace
   * in the header). Falls back to the signed-in user's avatar when omitted.
   */
  avatarOverride?: string;
  clickable?: boolean;
  /** Override the alt text / fallback initial. */
  nameOverride?: string;
}

const UserAvatar = ({
  ref,
  size = 40,
  background,
  clickable,
  className,
  style,
  avatarOverride,
  nameOverride,
  ...rest
}: UserAvatarProps & { ref?: React.RefObject<HTMLDivElement | null> }) => {
  const [avatar, nickName, username] = useUserStore((s) => [
    userProfileSelectors.userAvatar(s),
    userProfileSelectors.nickName(s),
    userProfileSelectors.username(s),
  ]);

  const isSignedIn = useUserStore(authSelectors.isLogin);
  const remoteServerUrl = useElectronStore(electronSyncSelectors.remoteServerUrl);

  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const reducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const motionEnabled = animationMode !== 'disabled' && !reducedMotion;

  // Process avatar URL for desktop environment
  const userAvatarUrl = useMemo(() => {
    if (!isSignedIn) return DEFAULT_USER_AVATAR_URL;
    if (!avatar) return;

    // If in desktop environment and avatar starts with /, prepend the remote server URL
    if (isDesktop && avatar.startsWith('/') && remoteServerUrl) {
      return remoteServerUrl + avatar;
    }

    return avatar;
  }, [isSignedIn, avatar, remoteServerUrl]);

  // When a `nameOverride` is provided, the component is in "non-user identity"
  // mode (e.g. active team workspace). Stay inside that identity — don't fall
  // through to the signed-in user's avatar/name, or the icon and the label
  // will disagree. When `nameOverride` is absent, keep the original user flow.
  const avatarValue = nameOverride
    ? avatarOverride || nameOverride
    : avatarOverride || userAvatarUrl || nickName || username;
  const altText = nameOverride || (isSignedIn ? nickName || username || 'User' : BRANDING_NAME);

  // The original rest spread owns shape, including an explicit undefined circle.
  const square = !('shape' in rest) || rest.shape === 'square';
  // The public square shape is an entity picture tile, independent of action/control size.
  const borderRadius = square ? 'var(--radius-card)' : size / 2;

  return (
    <Avatar
      alt={altText}
      avatar={remoteAvatarSrc(avatarValue) ? (avatarValue ?? undefined) : undefined}
      background={background}
      name={avatarValue ?? undefined}
      ref={ref}
      shape={'square'}
      size={size}
      style={{ borderRadius, ...style }}
      className={cn(
        styles.avatar,
        clickable && styles.clickable,
        clickable && motionEnabled && styles.transition,
        className,
      )}
      {...rest}
    />
  );
};

export default UserAvatar;
