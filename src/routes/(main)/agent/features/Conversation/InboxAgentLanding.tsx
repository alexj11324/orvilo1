'use client';

import { Flexbox } from '@lobehub/ui';
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
  inboxAgentId?: string;
  topicId?: string | null;
}

export const shouldShowInboxAgentLanding = ({
  agentId,
  inboxAgentId,
  topicId,
}: InboxAgentLandingState) => !!inboxAgentId && agentId === inboxAgentId && !topicId;

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
