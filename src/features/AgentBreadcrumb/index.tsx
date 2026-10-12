'use client';

import { agentDisplayName } from '@orvilo/types';
import { ChevronRight } from 'lucide-react';
import { Fragment, memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useAgentStore } from '@/store/agent';
import { agentSelectors, builtinAgentSelectors } from '@/store/agent/selectors';

import { useAgentRoutePath } from './useAgentRoutePath';

const styles = {
  breadcrumb:
    '[&_ol]:items-center [&_li]:flex [&_li]:items-center [&_.ant-breadcrumb-link]:flex [&_.ant-breadcrumb-link]:items-center [&_.ant-breadcrumb-link>a]:flex [&_.ant-breadcrumb-link>a]:items-center',
};

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
    <Breadcrumb className={styles.breadcrumb}>
      <BreadcrumbList className="leading-5.5">
        <BreadcrumbItem>
          <BreadcrumbLink className="text-muted-foreground" render={<Link to={agentHomePath} />}>
            <span className="truncate block max-w-50 font-medium text-inherit">{displayTitle}</span>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {title !== undefined && title !== null && (
          <>
            <BreadcrumbSeparator>
              <ChevronRight size={14} />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <span className="font-medium text-inherit">{title}</span>
            </BreadcrumbItem>
          </>
        )}
        {(extraItems ?? []).map((item, index) => (
          <Fragment key={`extra-${index}`}>
            <BreadcrumbSeparator>
              <ChevronRight size={14} />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <span className="font-medium text-inherit">{item}</span>
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
});

AgentBreadcrumb.displayName = 'AgentBreadcrumb';

export default AgentBreadcrumb;
