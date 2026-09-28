'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Alert, Button, SkeletonText, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Users } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import useSWR from 'swr';

import Avatar from '@/components/Avatar';

import { teammatesClient } from '../api/client';
import type { WorkspaceRole } from '../api/contract';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    padding: 32px;
    margin: 48px auto;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    max-width: 480px;
    width: 100%;
  `,
  projectRow: css`
    padding-block: 4px;
    padding-inline: 12px;
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorFillTertiary};
    font-size: 13px;
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

  const { data: preview, error, isLoading } = useSWR(
    token ? invitePreviewKey(token) : null,
    () => teammatesClient.invitation.preview.query({ token }),
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
      <Flexbox className={styles.card} gap={16}>
        <Alert title={t('workspaceSetting.invite.invalidLink')} type="error" />
      </Flexbox>
    );
  }

  if (isLoading) {
    return (
      <Flexbox className={styles.card} gap={16}>
        <SkeletonText style={{ width: 200 }} />
        <SkeletonText style={{ width: 320 }} />
        <SkeletonText style={{ width: 120 }} />
      </Flexbox>
    );
  }

  if (error || !preview) {
    return (
      <Flexbox className={styles.card} gap={16}>
        <Alert title={t('workspaceSetting.invite.loadFailed')} type="error" />
        <Button onClick={() => navigate('/', { replace: true })}>
          {t('workspaceSetting.invite.backHome')}
        </Button>
      </Flexbox>
    );
  }

  const terminal = preview.status !== 'pending';

  return (
    <Flexbox className={styles.card} gap={20}>
      <Flexbox horizontal align="center" gap={12}>
        <Avatar avatar={preview.workspace.avatar} name={preview.workspace.name} size={48} />
        <Flexbox gap={2}>
          <Text fontSize={18} weight={600}>
            {preview.workspace.name}
          </Text>
          <Text fontSize={13} type="secondary">
            {t('workspaceSetting.invite.invitedBy', {
              name: preview.inviter.name ?? t('workspaceSetting.invite.unknownInviter'),
            })}
          </Text>
        </Flexbox>
      </Flexbox>

      <Flexbox gap={8}>
        <Text fontSize={13}>
          {t('workspaceSetting.invite.roleLine', { role: roleLabel })}
          {preview.emailHint ? ` · ${preview.emailHint}` : ''}
        </Text>
        {preview.projects.length > 0 && (
          <Flexbox gap={6}>
            <Text fontSize={12} type="secondary">
              {t('workspaceSetting.invite.projectAccess')}
            </Text>
            {preview.projects.map((project) => (
              <div className={styles.projectRow} key={project.id}>
                {project.name} · {project.role}
              </div>
            ))}
          </Flexbox>
        )}
      </Flexbox>

      {terminal ? (
        <Alert
          showIcon
          title={
            preview.acceptedByCurrentUser
              ? t('workspaceSetting.invite.alreadyJoined')
              : t(`workspaceSetting.invite.status.${preview.status}`, {
                  defaultValue: preview.status,
                })
          }
          type={preview.acceptedByCurrentUser ? 'success' : 'warning'}
        />
      ) : (
        <>
          {acceptError && <Alert title={acceptError} type="error" />}
          <Button
            disabled={accepting}
            icon={<Icon icon={Users} size={16} />}
            loading={accepting}
            type="primary"
            onClick={handleAccept}
          >
            {t('workspaceSetting.invite.acceptAction')}
          </Button>
        </>
      )}

      {preview.acceptedByCurrentUser && (
        <Button onClick={() => void goToWorkspace(preview.workspace.id)}>
          {t('workspaceSetting.invite.goToWorkspace')}
        </Button>
      )}
    </Flexbox>
  );
});

InviteAcceptPage.displayName = 'InviteAcceptPage';

export default InviteAcceptPage;
