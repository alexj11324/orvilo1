'use client';

import { createStaticStyles, cx } from 'antd-style';
import { ChevronRight, InfoIcon, UsersIcon } from 'lucide-react';
import { memo, type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import AsyncError from '@/components/AsyncError';
import Loading from '@/components/Loading/BrandTextLoading';
import { toast } from '@/components/toast';
import { Alert, AlertTitle } from '@/components/ui/alert';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import type { PermissionResourceType } from '@/services/resourcePermission';
import { isForbiddenError } from '@/utils/forbiddenError';

import { AddCollaboratorButton, CollaboratorList } from './Collaborators';
import PolicySelect from './PolicySelect';
import { useAccessLevelOptions } from './useAccessLevelOptions';
import { useResourcePermission } from './useResourcePermission';

interface AccessFormItem {
  avatar?: ReactNode;
  children?: ReactNode;
  desc?: ReactNode;
  label?: ReactNode;
}

interface FormGroupItemType {
  children?: AccessFormItem[] | ReactNode;
  desc?: ReactNode;
  extra?: ReactNode;
  key?: string;
  title: ReactNode;
}

/**
 * Renders the lobehub `Form itemsType="group"` shape the access page uses: a
 * titled section with an optional description/extra, then label-control rows.
 */
const AccessFormGroups = ({ groups }: { groups: FormGroupItemType[] }) => (
  <div className="flex flex-col gap-6">
    {groups.map((group, index) => (
      <section className="flex flex-col gap-2" key={group.key ?? index}>
        <div className="flex flex-row items-center justify-between">
          <span className="font-semibold">{group.title}</span>
          {group.extra}
        </div>
        {group.desc ? <div className="text-muted-foreground">{group.desc}</div> : null}
        {Array.isArray(group.children)
          ? group.children.map((item, itemIndex) => (
              <div className="flex flex-row items-center justify-between gap-4" key={itemIndex}>
                <div className="flex flex-col gap-0.5">
                  <div className="flex flex-row items-center gap-2">
                    {item.avatar}
                    <span>{item.label}</span>
                  </div>
                  {item.desc ? <div className="text-muted-foreground">{item.desc}</div> : null}
                </div>
                {item.children}
              </div>
            ))
          : group.children}
      </section>
    ))}
  </div>
);

const styles = createStaticStyles(({ css }) => ({
  body: css`
    position: relative;
    overflow-y: auto;
    display: flex;
  `,
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
  rowIcon: css`
    display: flex;
    align-items: center;
    align-self: flex-start;
    height: 1em;
  `,
}));

interface ResourceAccessPageProps {
  /**
   * Per-type copy, already translated by the caller (static keys keep the
   * typed-i18n check): what the level grants day to day, and the private-mode
   * framing.
   */
  copy: {
    /** Shown under the Collaborators group title when `showCollaborators` is on. */
    collaboratorsDesc?: string;
    generalAccessDesc: string;
    privateHint: string;
    privateNotice: string;
  };
  /** Where a non-manager (or a missing/private-foreign resource) is sent. */
  redirectPath: string;
  /** Workspace-relative path of the resource itself — the breadcrumb's way back. */
  resourceHomePath: string;
  resourceId: string;
  /** Display name for the breadcrumb; omitted while it loads. */
  resourceName?: string | null;
  resourceType: PermissionResourceType;
  /**
   * Render the per-user Collaborators group below General access. Off by
   * default — only resource types whose flows support per-user grants
   * (knowledge bases today) turn it on.
   */
  showCollaborators?: boolean;
}

/**
 * A standalone Member-Permissions page for single-dimension resources
 * (Knowledge Base, Document) — the same page shape as Agent's, minus the
 * agent-specific editable-settings groups. Private resources are configurable
 * by their creator: the level is what members get the moment the resource is
 * published (the server stores it ahead of publishing).
 */
const ResourceAccessPage = memo<ResourceAccessPageProps>(
  ({
    copy,
    redirectPath,
    resourceHomePath,
    resourceId,
    resourceName,
    resourceType,
    showCollaborators,
  }) => {
    const { t } = useTranslation('setting');
    const navigate = useWorkspaceAwareNavigate();
    const activeWorkspaceSlug = useActiveWorkspaceSlug();
    const { data, error, isLoading, mutate, setAccessLevel, updating } = useResourcePermission(
      resourceType,
      resourceId,
    );

    const isPrivate = data?.visibility === 'private';
    const accessOptions = useAccessLevelOptions({
      accessLevel: data?.accessLevel,
      isPrivate,
      resourceType,
    });

    // Managing member access is a manager-only surface, like Agent's page: a
    // non-manager (or a private resource that is not the caller's) gets a
    // reason toast and lands back where they came from.
    const isDenied =
      (!!error && isForbiddenError(error)) || (!isLoading && !!data && !data.canManage);
    useEffect(() => {
      if (!isDenied) return;
      toast.error(t('permission.noManagePermission'));
      navigate(redirectPath, { replace: true });
    }, [isDenied, navigate, redirectPath, t]);

    const accessGroup: FormGroupItemType = {
      children: [
        {
          avatar: (
            <span className={styles.rowIcon}>
              <span className="anticon" role="img">
                <UsersIcon fill={'transparent'} height={16} size={16} width={16} />
              </span>
            </span>
          ),
          children: (
            <PolicySelect
              loading={updating}
              options={accessOptions}
              value={data?.accessLevel}
              onChange={(level) => void setAccessLevel(level)}
            />
          ),
          desc: isPrivate ? copy.privateHint : copy.generalAccessDesc,
          label: t('permission.page.accessLevelLabel'),
        },
      ],
      title: t('permission.page.memberGroup'),
    };

    const formGroups: FormGroupItemType[] = [accessGroup];
    if (showCollaborators) {
      formGroups.push({
        children: <CollaboratorList resourceId={resourceId} resourceType={resourceType} />,
        desc: copy.collaboratorsDesc,
        extra: <AddCollaboratorButton resourceId={resourceId} resourceType={resourceType} />,
        title: t('permission.collaborators.title'),
      });
    }

    return (
      <div className="flex flex-col h-[100%] w-[100%]">
        <NavHeader
          styles={{ left: { paddingInlineStart: 24 } }}
          left={
            <Breadcrumb className={styles.breadcrumb}>
              <BreadcrumbList>
                {resourceName ? (
                  <>
                    <BreadcrumbItem>
                      <BreadcrumbLink
                        render={
                          <Link
                            to={buildWorkspaceAwarePath(resourceHomePath, activeWorkspaceSlug)}
                          />
                        }
                      >
                        <span
                          className="truncate min-w-0 font-medium"
                          style={{ color: 'inherit', maxWidth: 200 }}
                        >
                          {resourceName}
                        </span>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator>
                      <ChevronRight size={14} />
                    </BreadcrumbSeparator>
                  </>
                ) : null}
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    <span className="font-medium" style={{ color: 'inherit' }}>
                      {t('permission.page.title')}
                    </span>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          }
        />
        <div className={cx('flex flex-col flex-1 w-[100%]', styles.body)}>
          <WideScreenContainer>
            <div className="flex flex-col gap-4 py-4">
              {error && !isDenied ? (
                <AsyncError error={error} variant={'inline'} onRetry={() => mutate()} />
              ) : isLoading || isDenied ? (
                <Loading debugId="ResourceAccessPage" />
              ) : (
                <>
                  {isPrivate ? (
                    <Alert style={{ width: '100%' }} variant="info">
                      <InfoIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
                      <AlertTitle>{copy.privateNotice}</AlertTitle>
                    </Alert>
                  ) : null}
                  <AccessFormGroups groups={formGroups} />
                </>
              )}
            </div>
          </WideScreenContainer>
        </div>
      </div>
    );
  },
);

ResourceAccessPage.displayName = 'ResourceAccessPage';

export default ResourceAccessPage;
