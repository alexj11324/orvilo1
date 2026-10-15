'use client';

import { isDesktop } from '@orvilo/const';
import { RENDERER_HANDLED_LINK_ATTR } from '@orvilo/desktop-bridge';
import { cn } from 'cn';
import type { MouseEvent, ReactNode } from 'react';
import { memo, useCallback } from 'react';

import { useWorkspaces } from '@/business/client/hooks/useWorkspaces';
import { Button } from '@/components/ui/button';
import { parseInternalLink } from '@/features/Conversation/Markdown/plugins/Link/internalLink';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

interface BriefActionLinkProps {
  /** Agent owning the brief's task — keeps the task detail path agent-scoped. */
  agentId?: string | null;
  children: ReactNode;
  className?: string;
  /** Renders the filled primary variant used for a card's leading action. */
  primary?: boolean;
  taskId?: string | null;
  url?: string;
}

export const BriefActionLink = memo<BriefActionLinkProps>(
  ({ children, className, primary, url }) => {
    const navigate = useWorkspaceAwareNavigate();
    const workspaces = useWorkspaces();

    const reference = parseInternalLink(
      url,
      typeof window === 'undefined' ? undefined : window.location.origin,
      workspaces.map((workspace) => workspace.slug),
    );
    const isRendererHandled = !!reference;

    const handleClick = useCallback(
      (event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
        // External destinations (billing, docs) stay plain anchors.
        if (!reference) return;
        if (event.button !== 0) return;

        // On the web a modifier-click means "open in a new tab", so let the
        // browser handle it. Desktop has no tabs for it to open.
        const modifierClick = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (!isDesktop && modifierClick) return;

        event.preventDefault();

        // A path that already carries its workspace slug must not be prefixed twice.
        navigate(
          reference.pathname,
          'workspaceSlug' in reference && reference.workspaceSlug ? { escape: true } : undefined,
        );
      },
      [navigate, reference],
    );

    return (
      <Button
        {...(isRendererHandled ? { [RENDERER_HANDLED_LINK_ATTR]: 'true' } : {})}
        className={cn('rounded-full', className)}
        nativeButton={false}
        render={<a href={url} />}
        size="compact"
        variant={primary ? 'default' : 'outline'}
        onClick={handleClick}
      >
        {children}
      </Button>
    );
  },
);

BriefActionLink.displayName = 'BriefActionLink';
