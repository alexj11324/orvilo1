'use client';

import { BUILTIN_AGENT_SLUGS } from '@orvilo/builtin-agents';
import { INBOX_SESSION_ID } from '@orvilo/const';
import { cn } from 'cn';
import type { ReactNode } from 'react';

import { ProductLogo } from '@/components/Branding';

const styles = {
  composer: 'relative z-1 flex flex-none flex-col gap-4 w-[min(744px,calc(100%-16px))] my-auto',
  root: 'isolate relative w-full min-h-0 box-border overflow-x-hidden overflow-y-auto py-4',
  watermark:
    'pointer-events-none absolute z-0 inset-bs-[calc(50%-92px)] start-1/2 aspect-square w-[min(336px,calc(100%-54px))] -translate-x-1/2 -translate-y-1/2 opacity-3.5 [[data-theme=dark]_&]:invert',
} as const;

interface InboxAgentLandingProps {
  children: ReactNode;
}

interface InboxAgentLandingState {
  agentId?: string;
  /**
   * The hydrated agent row's slug — resolves a direct visit to the inbox
   * agent's real id while `builtinAgentIdMap` is still empty.
   */
  agentSlug?: string | null;
  inboxAgentConfigInit?: boolean;
  inboxAgentId?: string;
  topicId?: string | null;
}

export const shouldShowInboxAgentLanding = ({
  agentId,
  inboxAgentId,
  topicId,
}: InboxAgentLandingState) => !!inboxAgentId && agentId === inboxAgentId && !topicId;

/**
 * Whether the current coordinate targets the inbox agent even though the
 * builtin map cannot prove it yet: either the `/agent/inbox` slug route is
 * still awaiting its redirect to the real id, or a hydrated agent row whose
 * slug is `inbox` arrived before `builtinAgentIdMap` did.
 */
export const isInboxAgentRouteTarget = ({ agentId, agentSlug }: InboxAgentLandingState) =>
  agentId === BUILTIN_AGENT_SLUGS.inbox || agentSlug === INBOX_SESSION_ID;

/**
 * While the builtin map is still resolving, an inbox-bound visit cannot be
 * told apart from a populated one — and the populated path renders the
 * deprecated `AgentHome` welcome card, which flashes before the landing
 * swaps in. Callers show the landing chrome with a neutral loading state
 * instead. Scoped to inbox targets only, so custom agents keep their own
 * welcome surface during the same window.
 */
export const shouldShowInboxAgentResolving = ({
  agentId,
  agentSlug,
  inboxAgentConfigInit,
  topicId,
}: InboxAgentLandingState) =>
  !topicId && !inboxAgentConfigInit && isInboxAgentRouteTarget({ agentId, agentSlug });

const InboxAgentLanding = ({ children }: InboxAgentLandingProps) => {
  return (
    <div
      className={cn('flex flex-col items-center flex-1', styles.root)}
      data-testid="inbox-agent-landing-scroll-region"
    >
      <div aria-hidden className={styles.watermark}>
        <ProductLogo size={336} style={{ height: '100%', width: '100%' }} type={'mono'} />
      </div>
      <div className={styles.composer} data-testid="inbox-agent-landing-content">
        {children}
      </div>
    </div>
  );
};

export default InboxAgentLanding;
