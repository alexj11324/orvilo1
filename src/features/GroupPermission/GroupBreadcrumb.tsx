'use client';

import { createStaticStyles } from 'antd-style';
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
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link to={groupHomePath} />}>
            <span
              className="truncate block font-medium"
              style={{ maxWidth: 200, color: 'inherit' }}
            >
              {displayTitle}
            </span>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {title !== undefined && title !== null && (
          <>
            <BreadcrumbSeparator>
              <ChevronRight size={14} />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <span className="font-medium" style={{ color: 'inherit' }}>
                {title}
              </span>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
});

GroupBreadcrumb.displayName = 'GroupBreadcrumb';

export default GroupBreadcrumb;
