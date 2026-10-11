'use client';

import { cn } from 'cn';
import { XIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { Badge } from '@/components/reui/badge';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogConfirm,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { PermissionResourceType, ResourceCollaborator } from '@/services/resourcePermission';

import { useAccessLevelOptions } from '../useAccessLevelOptions';
import { useResourceCollaborators } from '../useResourceCollaborators';

const styles = {
  empty: 'py-3 text-sm leading-5.5 text-foreground-description',
  row: 'py-2',
};

const displayName = (collaborator: ResourceCollaborator) =>
  collaborator.user?.fullName ||
  collaborator.user?.username ||
  collaborator.user?.email ||
  collaborator.userId;

interface CollaboratorListProps {
  resourceId: string;
  resourceType: PermissionResourceType;
}

/**
 * The collaborator grants of one resource: who is lifted above the workspace
 * access level, at which grade, with per-row revoke. Static management list —
 * rows are not links and carry no hover chrome.
 */
const CollaboratorList = memo<CollaboratorListProps>(({ resourceId, resourceType }) => {
  const { t } = useTranslation('setting');
  const { collaborators, error, isLoading, mutate, mutating, removeCollaborator } =
    useResourceCollaborators(resourceType, resourceId);

  const levelOptions = useAccessLevelOptions({ isPrivate: false, resourceType });

  if (error) return <AsyncError error={error} variant={'inline'} onRetry={() => mutate()} />;

  if (isLoading)
    return (
      <div className="flex flex-col gap-1">
        {[0, 1].map((key) => (
          <div className={cn('flex flex-row items-center gap-3', styles.row)} key={key}>
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="mbe-0 w-40" />
          </div>
        ))}
      </div>
    );

  if (!collaborators || collaborators.length === 0)
    return (
      <div className={styles.empty}>
        {t(
          resourceType === 'agent'
            ? 'settingAgent.useMembers.empty'
            : 'permission.collaborators.empty',
        )}
      </div>
    );

  return (
    <div className="flex flex-col">
      {collaborators.map((collaborator) => {
        const name = displayName(collaborator);
        const email = collaborator.user?.email;
        const levelLabel = levelOptions.find(
          (option) => option.value === collaborator.accessLevel,
        )?.label;

        return (
          <div
            className={cn('flex flex-row items-center gap-3', styles.row)}
            key={collaborator.userId}
          >
            <Avatar avatar={collaborator.user?.avatar || undefined} size={32} title={name} />
            <div className="flex flex-col flex-1 min-w-0">
              <div className="truncate min-w-0 text-sm leading-5.5 font-medium">{name}</div>
              {email && email !== name ? (
                <div className="truncate min-w-0 text-xs text-muted-foreground">{email}</div>
              ) : null}
            </div>
            {resourceType !== 'agent' && levelLabel ? (
              <Badge variant="secondary">{levelLabel}</Badge>
            ) : null}
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <ActionIcon
                    disabled={mutating}
                    icon={XIcon}
                    size={{ blockSize: 28, borderRadius: 6, size: 14 }}
                    title={t('permission.collaborators.remove')}
                  />
                }
              />
              <AlertDialogContent className="rounded-(--radius-overlay)">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('permission.collaborators.removeConfirmTitle', { name })}
                  </AlertDialogTitle>
                </AlertDialogHeader>
                <AlertDialogFooter className="rounded-b-(--radius-overlay)">
                  <AlertDialogCancel size="normal">
                    {t('cancel', { ns: 'common' })}
                  </AlertDialogCancel>
                  <AlertDialogConfirm
                    size="normal"
                    variant="destructive"
                    onClick={() => void removeCollaborator(collaborator.userId)}
                  >
                    {t('permission.collaborators.remove')}
                  </AlertDialogConfirm>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      })}
    </div>
  );
});

CollaboratorList.displayName = 'CollaboratorList';

export default CollaboratorList;
