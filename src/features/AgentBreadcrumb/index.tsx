'use client';

import { agentDisplayName } from '@orvilo/types';
import { Breadcrumb as AntBreadcrumb } from 'antd';
import { createStaticStyles } from 'antd-style';
import { ChevronRight } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useAgentStore } from '@/store/agent';
import { agentSelectors, builtinAgentSelectors } from '@/store/agent/selectors';

import { useAgentRoutePath } from './useAgentRoutePath';

const styles = createStaticStyles(({ css }) => ({
  breadcrumb: css`
    ol {
      align-items: center;
    }

    li,
    .ant-breadcrumb-link,
    .ant-breadcrumb-link > a {
      display: flex;
      align-items: center;
    }
  `,
}));

interface AgentBreadcrumbProps {
  agentId: string;
  /** Additional breadcrumb items appended after the current section. */
  extraItems?: ReactNode[];
  /**
   * The current section under the agent, e.g. 话题 / 助理档案 / 用量与成本.
   * Omit it where the page already names its own section — the profile group
   * carries a Segmented switcher, so repeating the active tab here would render
   * the same word twice in one 44px bar.
   */
  title?: ReactNode;
}

/**
 * Breadcrumb for pages that live under an agent: `<AgentName> › <Section>`.
 * The agent name links back to the agent home; the section is the current page.
 */
const AgentBreadcrumb = memo<AgentBreadcrumbProps>(({ agentId, extraItems, title }) => {
  const { t } = useTranslation(['chat', 'common']);
  const buildAgentPath = useAgentRoutePath(agentId);
  const agentTitle = useAgentStore((s) =>
    agentDisplayName(agentSelectors.getAgentMetaById(agentId)(s)),
  );
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const isInbox = !!inboxAgentId && agentId === inboxAgentId;
  const displayTitle = isInbox
    ? agentTitle || t('inbox.title', { ns: 'chat' })
    : agentTitle || t('defaultSession', { ns: 'common' });
  const agentHomePath = buildAgentPath();

  return (
    <AntBreadcrumb
      className={styles.breadcrumb}
      separator={<ChevronRight size={14} />}
      items={[
        {
          title: (
            <Link to={agentHomePath}>
              <span
                className="truncate block font-medium"
                style={{ maxWidth: 200, color: 'inherit' }}
              >
                {displayTitle}
              </span>
            </Link>
          ),
        },
        ...(title === undefined || title === null
          ? []
          : [
              {
                title: (
                  <span className="font-medium" style={{ color: 'inherit' }}>
                    {title}
                  </span>
                ),
              },
            ]),
        ...(extraItems ?? []).map((item, index) => ({
          key: `extra-${index}`,
          title: (
            <span className="font-medium" style={{ color: 'inherit' }}>
              {item}
            </span>
          ),
        })),
      ]}
    />
  );
});

AgentBreadcrumb.displayName = 'AgentBreadcrumb';

export default AgentBreadcrumb;
