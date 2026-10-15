'use client';

import { LockIcon } from 'lucide-react';
import { createElement, memo } from 'react';

import LibIcon from './index';
import LockedLibIcon from './Locked';

export type LibraryIconVariant = 'private' | 'restricted' | 'workspace';

export const getLibraryIconVariant = ({
  memberRestricted,
  visibility,
}: {
  memberRestricted?: boolean;
  visibility?: 'private' | 'public' | null;
}): LibraryIconVariant => {
  if (visibility === 'private') return 'private';
  if (visibility === 'public' && memberRestricted) return 'restricted';

  return 'workspace';
};

interface LibraryStatusIconProps {
  color?: string;
  memberRestricted?: boolean;
  size?: number;
  visibility?: 'private' | 'public' | null;
}

/**
 * One semantic icon mapping for every library identity surface:
 * private → lock, member-restricted workspace library → folder + lock,
 * ordinary workspace library → folder.
 */
const LibraryStatusIcon = memo<LibraryStatusIconProps>(
  ({ color, memberRestricted, size = 20, visibility }) => {
    const variant = getLibraryIconVariant({ memberRestricted, visibility });

    if (variant === 'private') {
      return createElement(LockIcon, {
        size: 16,
        style: { color: color ?? 'var(--foreground-description)' },
      });
    }
    if (variant === 'restricted') return <LockedLibIcon color={color} size={size} />;

    return <LibIcon color={color} size={size} />;
  },
);

LibraryStatusIcon.displayName = 'LibraryStatusIcon';

export default LibraryStatusIcon;
