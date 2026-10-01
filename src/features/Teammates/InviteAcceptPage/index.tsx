'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import { CircleCheck, TriangleAlert, Users } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import useSWR from 'swr';

import Avatar from '@/components/Avatar';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { teammatesClient } from '../api/client';
import type { WorkspaceRole } from '../api/contract';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    width: 100%;
    max-width: 480px;
    margin-block: 48px;
    margin-inline: auto;
    padding: 32px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,
  projectRow: css`
    padding-block: 4px;
    padding-inline: 12px;
    border-radius: ${cssVar.borderRadius};

    font-size: 13px;

    background: ${cssVar.colorFillTertiary};
  `,
}));

const WORKSPACE_ROLE_LABEL = {
  admin: 'workspaceSetting.members.role.admin',
  member: 'workspaceSetting.members.role.member',
  owner: 'workspaceSetting.members.role.owner',
  viewer: 'workspaceSetting.members.role.viewer',
} as const satisfies Record<WorkspaceRole, string>;

const invitePreviewKey = (token: string) => ['teammates:invitePreview', token] as const;

const InviteAcceptPage = memo(() => {
  const { t } = useTranslation('setting');
  const navigate = useNavigate();
  const token = useParams<{ token: string }>().token ?? '';

  const {
    data: preview,
    error,
    isLoading,
  } = useSWR(token ? invitePreviewKey(token) : null, () =>
    teammatesClient.invitation.preview.query({ token }),
  );

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const roleLabel = useMemo(() => {
    const role = preview?.role as WorkspaceRole | undefined;
    return role && role in WORKSPACE_ROLE_LABEL
      ? t(WORKSPACE_ROLE_LABEL[role as WorkspaceRole])
      : (preview?.role ?? '');
  }, [preview?.role, t]);

  /** After accept, land the invitee inside the joined workspace. */
  const goToWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        const memberships = await teammatesClient.workspace.list.query();
        const slug = memberships.find((m) => m.id === workspaceId)?.slug;
        navigate(slug ? `/${slug}` : '/', { replace: true });
      } catch {
        navigate('/', { replace: true });
      }
    },
    [navigate],
  );

  const handleAccept = useCallback(async () => {
    if (accepting) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const { workspaceId } = await teammatesClient.invitation.accept.mutate({ token });
      await goToWorkspace(workspaceId);
    } catch (acceptErr) {
      setAcceptError((acceptErr as Error)?.message || t('workspaceSetting.invite.acceptFailed'));
      setAccepting(false);
    }
  }, [accepting, goToWorkspace, t, token]);

  if (!token) {
    return (
      <div className={cx(styles.card, 'flex flex-col gap-4')}>
        <Alert variant="destructive">
          <AlertTitle>{t('workspaceSetting.invite.invalidLink')}</AlertTitle>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cx(styles.card, 'flex flex-col gap-4')}>
        <Skeleton className="h-3" style={{ width: 200 }} />
        <Skeleton className="h-3" style={{ width: 320 }} />
        <Skeleton className="h-3" style={{ width: 120 }} />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className={cx(styles.card, 'flex flex-col gap-4')}>
        <Alert variant="destructive">
          <AlertTitle>{t('workspaceSetting.invite.loadFailed')}</AlertTitle>
        </Alert>
        <Button onClick={() => navigate('/', { replace: true })}>
          {t('workspaceSetting.invite.backHome')}
        </Button>
      </div>
    );
  }

  const terminal = preview.status !== 'pending';

  return (
    <div className={cx(styles.card, 'flex flex-col gap-5')}>
      <div className="flex items-center gap-3">
        <Avatar avatar={preview.workspace.avatar} name={preview.workspace.name} size={48} />
        <div className="flex flex-col gap-0.5">
          <div className="text-[18px] font-semibold">{preview.workspace.name}</div>
          <div className="text-[13px] text-muted-foreground">
            {t('workspaceSetting.invite.invitedBy', {
              name: preview.inviter.name ?? t('workspaceSetting.invite.unknownInviter'),
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[13px]">
          {t('workspaceSetting.invite.roleLine', { role: roleLabel })}
          {preview.emailHint ? ` · ${preview.emailHint}` : ''}
        </div>
        {preview.projects.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="text-[12px] text-muted-foreground">
              {t('workspaceSetting.invite.projectAccess')}
            </div>
            {preview.projects.map((project) => (
              <div className={styles.projectRow} key={project.id}>
                {project.name} · {project.role}
              </div>
            ))}
          </div>
        )}
      </div>

      {terminal ? (
        <Alert variant={preview.acceptedByCurrentUser ? 'success' : 'warning'}>
          {preview.acceptedByCurrentUser ? <CircleCheck /> : <TriangleAlert />}
          <AlertTitle>
            {preview.acceptedByCurrentUser
              ? t('workspaceSetting.invite.alreadyJoined')
              : t(`workspaceSetting.invite.status.${preview.status}`, {
                  defaultValue: preview.status,
                })}
          </AlertTitle>
        </Alert>
      ) : (
        <>
          {acceptError && (
            <Alert variant="destructive">
              <AlertTitle>{acceptError}</AlertTitle>
            </Alert>
          )}
          <Button disabled={accepting} loading={accepting} variant="default" onClick={handleAccept}>
            {<Users size={16} />}
            {t('workspaceSetting.invite.acceptAction')}
          </Button>
        </>
      )}

      {preview.acceptedByCurrentUser && (
        <Button onClick={() => void goToWorkspace(preview.workspace.id)}>
          {t('workspaceSetting.invite.goToWorkspace')}
        </Button>
      )}
    </div>
  );
});

InviteAcceptPage.displayName = 'InviteAcceptPage';

export default InviteAcceptPage;
