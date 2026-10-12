'use client';

import { AGENT_CHAT_URL } from '@orvilo/const';
import { cn } from 'cn';
import { ArrowRight } from 'lucide-react';
import { memo, useCallback } from 'react';

import Avatar from '@/components/Avatar';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { type MarkdownElementProps } from '../../type';

interface OrviloAgentsProps extends MarkdownElementProps {
  avatar?: string;
  backgroundColor?: string;
  description?: string;
  identifier: string;
  title: string;
}

const Render = memo<OrviloAgentsProps>(
  ({ identifier, title, description, avatar, backgroundColor }) => {
    const navigate = useWorkspaceAwareNavigate();

    const handleClick = useCallback(() => {
      if (!identifier) return;
      navigate(AGENT_CHAT_URL(identifier));
    }, [navigate, identifier]);

    if (!identifier) return null;

    return (
      <div
        {...clickableProps()}
        className={cn(
          'flex items-center gap-3 cursor-pointer p-4 rounded-(--radius-card) bg-fill-quaternary transition-[background] duration-(--orvilo-motion-mid) ease-[ease] hover:bg-muted motion-reduce:transition-none',
          CLICKABLE_FOCUS_RING,
        )}
        onClick={handleClick}
      >
        <Avatar
          avatar={avatar || '🤖'}
          background={backgroundColor}
          shape={'square'}
          size={40}
          title={title || undefined}
        />
        <div className="flex flex-col flex-1 gap-1 min-w-0">
          <span className="truncate text-sm leading-5.5 font-medium">{title || identifier}</span>
          {description && (
            <span className="truncate text-xs leading-5 text-muted-foreground">{description}</span>
          )}
        </div>
        <ArrowRight className="shrink-0 text-foreground-tertiary" size={16} />
      </div>
    );
  },
);

Render.displayName = 'OrviloAgentsRender';

export default Render;
