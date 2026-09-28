'use client';

import { Flexbox } from '@lobehub/ui';
import { BUILTIN_AGENT_SLUGS } from '@orvilo/builtin-agents';
import { INBOX_SESSION_ID } from '@orvilo/const';
import { createStaticStyles } from 'antd-style';
import type { ReactNode } from 'react';

import { ProductLogo } from '@/components/Branding';

const styles = createStaticStyles(({ css }) => ({
  composer: css`
    position: relative;
    z-index: 1;

    display: flex;
    flex: none;
    flex-direction: column;
    gap: 16px;

    width: min(744px, calc(100% - 16px));
    margin-block: auto;
  `,
  root: css`
    isolation: isolate;
    position: relative;

    overflow: hidden auto;

    box-sizing: border-box;
    min-height: 0;
    padding-block: 16px;
  `,
  watermark: css`
    pointer-events: none;

    position: absolute;
    z-index: 0;
    inset-block-start: calc(50% - 92px);
    inset-inline-start: 50%;
    transform: translate(-50%, -50%);

    aspect-ratio: 1;
    width: min(336px, calc(100% - 54px));

    opacity: 0.035;

    [data-theme='dark'] & {
      filter: invert(1);
    }
  `,
}));

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
    <Flexbox
      align={'center'}
      className={styles.root}
      data-testid="inbox-agent-landing-scroll-region"
      flex={1}
      width={'100%'}
    >
      <div aria-hidden className={styles.watermark}>
        <ProductLogo size={336} style={{ height: '100%', width: '100%' }} type={'mono'} />
      </div>
      <div className={styles.composer} data-testid="inbox-agent-landing-content">
        {children}
      </div>
    </Flexbox>
  );
};

export default InboxAgentLanding;
