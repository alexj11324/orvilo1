'use client';

import type { AgentTopicSharePolicy } from '@orvilo/types';
import { InfoIcon, LockIcon, Share2, UsersIcon } from 'lucide-react';
import { memo, type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { Alert, AlertTitle } from '@/components/ui/alert';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import PolicySelect, { type PolicyOption } from '@/features/ResourcePermission/PolicySelect';
import { useAccessLevelOptions } from '@/features/ResourcePermission/useAccessLevelOptions';

import { resolveGroupPermissionSections } from './permissionSections';
import { useGroupPermission } from './useGroupPermission';

interface PermissionFormRow {
  avatar?: ReactNode;
  children?: ReactNode;
  desc?: ReactNode;
  label?: ReactNode;
}

interface PermissionFormGroup {
  children: PermissionFormRow[];
  title?: ReactNode;
}

// Same inherited one-line title alignment as AgentPermission.
const styles = {
  rowIcon: 'flex h-lh items-center self-start',
};

interface PermissionFormProps {
  groupId: string;
}

const PermissionForm = memo<PermissionFormProps>(({ groupId }) => {
  const { t } = useTranslation('setting');
  const {
    accessError,
    accessLevel,
    accessLoading,
    canEditConfig,
    canEditPolicies,
    canManageAccess,
    hasSupervisor,
    isPrivate,
    isWorkspaceGroup,
    retryAccess,
    setAccessLevel,
    setTopicSharePolicy,
    topicSharePolicy,
  } = useGroupPermission(groupId);

  const accessOptions = useAccessLevelOptions({ accessLevel, isPrivate });

  // Same authority as the Agent page: these write the supervisor agent's
  // policy keys, which the server accepts only from its creator or the
  // workspace owner and silently drops from anyone else's save.
  const policiesDisabled = !canEditConfig || !canEditPolicies;
  const sections = resolveGroupPermissionSections({
    accessError,
    canManageAccess,
    hasSupervisor,
    isPrivate,
    isWorkspaceGroup,
  });

  const topicSharePolicyOptions = useMemo(
    (): PolicyOption<AgentTopicSharePolicy>[] => [
      {
        desc: t('permission.page.groupTopicSharePolicyMemberDesc'),
        icon: UsersIcon,
        label: t('settingAgent.topicSharePolicy.membersCanShare'),
        value: 'member',
      },
      {
        desc: t('permission.page.groupTopicSharePolicyRestrictedDesc'),
        icon: LockIcon,
        label: t('settingAgent.topicSharePolicy.membersCannotShare'),
        value: 'restricted',
      },
    ],
    [t],
  );

  if (sections.showPersonalEmpty) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>{t('permission.page.groupPersonalTitle')}</EmptyTitle>
          <EmptyDescription>{t('permission.page.groupPersonalDesc')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const memberGroup: PermissionFormGroup | undefined = sections.showAccessCard
    ? {
        children: [
          {
            avatar: (
              <span className={styles.rowIcon}>
                <UsersIcon size={16} />
              </span>
            ),
            children: (
              <PolicySelect
                // Not disabled while the write is in flight: the level updates
                // optimistically and a failure rolls back with a toast, so
                // greying the control out only adds a visible dead beat — the
                // policies next to it behave the same way.
                disabled={!canManageAccess}
                loading={accessLoading}
                options={accessOptions}
                value={accessLevel}
                onChange={setAccessLevel}
              />
            ),
            desc: t(sections.accessDescKey),
            label: t('permission.page.accessLevelLabel'),
          },
          // Group topics are stored against the supervisor agent, so this row
          // writes the same field the Agent Permission page does. Without it
          // the policy would still apply to group conversations with no way to
          // see or change it from the group.
          ...(sections.showConfigCard
            ? [
                {
                  avatar: (
                    <span className={styles.rowIcon}>
                      <Share2 size={16} />
                    </span>
                  ),
                  children: (
                    <PolicySelect
                      disabled={policiesDisabled}
                      options={topicSharePolicyOptions}
                      value={topicSharePolicy}
                      onChange={setTopicSharePolicy}
                    />
                  ),
                  desc: canEditPolicies
                    ? t('permission.page.groupTopicSharePolicyDesc')
                    : t('permission.noManagePermission'),
                  label: t('settingAgent.topicSharePolicy.title'),
                },
              ]
            : []),
        ],
        title: t('permission.page.memberGroup'),
      }
    : undefined;

  return (
    <>
      {/* A failed permission fetch must not read as "this group has no member
          permissions" — name the failure and keep a way back to the data. */}
      {accessError ? (
        <AsyncError error={accessError} variant={'inline'} onRetry={retryAccess} />
      ) : null}
      {/* Everything below describes what happens once the group is shared, so
          say that once, up front, instead of qualifying each control. */}
      {sections.showPrivateNotice ? (
        <Alert style={{ width: '100%' }} variant="info">
          <InfoIcon />
          <AlertTitle>{t('permission.page.groupPrivateNotice')}</AlertTitle>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-4">
        {[memberGroup]
          .filter((group): group is PermissionFormGroup => !!group)
          .map((group) => (
            <div
              className="flex flex-col gap-2 rounded-(--radius-card) bg-accent p-4"
              key={String(group.title)}
            >
              <div className="text-base leading-6 font-semibold">{group.title}</div>
              {group.children.map((item, index) => (
                <div className="flex items-center justify-between gap-4 py-1.5" key={index}>
                  <div className="flex items-start gap-2.5">
                    {item.avatar}
                    <div className="flex flex-col">
                      <span className="text-sm">{item.label}</span>
                      <span className="text-xs leading-5 text-foreground-description">
                        {item.desc}
                      </span>
                    </div>
                  </div>
                  {item.children}
                </div>
              ))}
            </div>
          ))}
      </div>
    </>
  );
});

PermissionForm.displayName = 'GroupPermissionForm';

export default PermissionForm;
