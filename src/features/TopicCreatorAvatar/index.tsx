'use client';

import { memo, type ReactNode } from 'react';

import { useAuthorInfo } from '@/business/client/hooks/useAuthorInfo';
import Avatar from '@/components/Avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Resolves a topic creator's profile from the *active workspace* members.
 * `useAuthorInfo` is a business slot: cloud resolves the member profile, the
 * open-source build is a no-op — and it returns `undefined` without an active
 * workspace, so all creator-avatar UI disappears in personal mode.
 */
export const useTopicCreator = (userId?: string) => useAuthorInfo(userId);

interface TopicCreatorAvatarProps {
  /**
   * Optional mini node (execution status, bot platform icon, PR marker, …)
   * overlaid at the avatar's bottom-right corner. The creator stays the
   * primary visual; the status glyph keeps its visible16px role in the badge.
   */
  corner?: ReactNode;
  /** Size of the avatar in px. */
  size?: number;
  /** Creator (author) of the topic. */
  userId?: string;
}

/**
 * Round creator avatar for a workspace topic row's leading icon slot — it
 * replaces the default `#` placeholder so the shared list reads like a
 * conversation list. Renders nothing when the creator doesn't resolve
 * (personal mode / unknown member).
 */
const TopicCreatorAvatar = memo<TopicCreatorAvatarProps>(({ userId, size = 20, corner }) => {
  const author = useTopicCreator(userId);

  if (!author) return null;

  const avatar = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Avatar
                avatar={author.avatar ?? undefined}
                className="flex-none"
                name={author.fullName ?? undefined}
                shape={'circle'}
                size={size}
                title={author.fullName ?? undefined}
              />
            </span>
          }
        />
        <TooltipContent>{author.fullName}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  if (!corner) return avatar;

  return (
    <span className="relative inline-flex leading-0">
      {avatar}
      {/* Passive presence graphic: keep the supplied16px state glyph unscaled.
          Canvas paint/halo separates it from the avatar; positioning stays bottom-right. */}
      <span className="absolute -bottom-1 -right-1 inline-flex size-4 items-center justify-center rounded-full bg-background leading-0 shadow-[0_0_0_1.5px_var(--background)]">
        <span className="inline-flex items-center justify-center">{corner}</span>
      </span>
    </span>
  );
});

TopicCreatorAvatar.displayName = 'TopicCreatorAvatar';

export default TopicCreatorAvatar;
