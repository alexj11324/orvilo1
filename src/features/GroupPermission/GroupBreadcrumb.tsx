'use client';

import { ChevronRight } from 'lucide-react';
import { memo, type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import urlJoin from 'url-join';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

const styles = {
  breadcrumb:
    '[&_ol]:items-center [&_li]:flex [&_li]:items-center [&_.ant-breadcrumb-link]:flex [&_.ant-breadcrumb-link]:items-center [&_.ant-breadcrumb-link>a]:flex [&_.ant-breadcrumb-link>a]:items-center',
};

interface GroupBreadcrumbProps {
  groupId: string;
  /** The current section under the group, e.g. 成员权限. */
  title?: ReactNode;
}

/**
 * Breadcrumb for pages that live under an agent group: `<GroupName> › <Section>`,
 * the group-side counterpart of `AgentBreadcrumb`. The group name links back to
 * the group chat.
 */
const GroupBreadcrumb = memo<GroupBreadcrumbProps>(({ groupId, title }) => {
  const { t } = useTranslation('chat');
  const activeWorkspaceSlug = useActiveWorkspaceSlug();
  const groupTitle = useAgentGroupStore(
    (s) => agentGroupSelectors.getGroupById(groupId)(s)?.title || '',
  );
  const displayTitle = groupTitle || t('group.title');
  const groupHomePath = useMemo(
    () => buildWorkspaceAwarePath(urlJoin('/group', groupId), activeWorkspaceSlug),
    [activeWorkspaceSlug, groupId],
  );

  return (
    <Breadcrumb className={styles.breadcrumb}>
      <BreadcrumbList className="leading-5.5">
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link to={groupHomePath} />}>
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
      </BreadcrumbList>
    </Breadcrumb>
  );
});

GroupBreadcrumb.displayName = 'GroupBreadcrumb';

export default GroupBreadcrumb;
