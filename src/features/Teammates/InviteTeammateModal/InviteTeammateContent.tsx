'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import {
  Alert,
  Button,
  ModalFooter,
  Select,
  Text,
  TextArea,
  useModalContext,
} from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { CheckCircle2, TriangleAlert, XCircle } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import { mutate } from '@/libs/swr';
import { useCurrentProjectList, useProjectStore } from '@/store/project';

import type { InviteBatchResult, ProjectRole, WorkspaceRole } from '../api/contract';
import { useTeammateActions } from '../api/hooks';
import { teammatesKeys } from '../api/keys';
import { grantableWorkspaceRoles, PROJECT_ROLE_ORDER } from '../api/roleCapabilities';

const styles = createStaticStyles(({ css }) => ({
  body: css`
    padding-block: 0 16px;
    padding-inline: 20px;
  `,
  emailResult: css`
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
  `,
  resultList: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
}));

const EMAIL_PATTERN = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;

/** Split on commas / whitespace / newlines, dedupe, drop empties. */
export const parseEmails = (raw: string): { emails: string[]; invalid: string[] } => {
  const seen = new Set<string>();
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const token of raw.split(/[\s,;]+/)) {
    const email = token.trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    if (EMAIL_PATTERN.test(email)) {
      emails.push(email);
    } else {
      invalid.push(email);
    }
  }
  return { emails, invalid };
};

const WORKSPACE_ROLE_LABEL = {
  admin: 'workspaceSetting.members.role.admin',
  member: 'workspaceSetting.members.role.member',
  owner: 'workspaceSetting.members.role.owner',
  viewer: 'workspaceSetting.members.role.viewer',
} as const satisfies Record<WorkspaceRole, string>;

const PROJECT_ROLE_LABEL = {
  commenter: 'workspaceSetting.members.projectRole.commenter',
  contributor: 'workspaceSetting.members.projectRole.contributor',
  manager: 'workspaceSetting.members.projectRole.manager',
  viewer: 'workspaceSetting.members.projectRole.viewer',
} as const satisfies Record<ProjectRole, string>;

interface InviteTeammateContentProps {
  /** Pre-select a project (e.g. invited from inside a project surface). */
  defaultProjectIds?: string[];
}

export const InviteTeammateTitle = memo(() => {
  const { t } = useTranslation('setting');
  return t('workspaceSetting.members.inviteTitle');
});

const InviteTeammateContent = memo<InviteTeammateContentProps>(({ defaultProjectIds }) => {
  const { t } = useTranslation('setting');
  const { close } = useModalContext();
  const capabilities = useWorkspaceCapabilities();
  const { invite } = useTeammateActions();

  useProjectStore((s) => s.useFetchProjectList)(true);
  const projects = useCurrentProjectList();

  const [rawEmails, setRawEmails] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [projectIds, setProjectIds] = useState<string[]>(defaultProjectIds ?? []);
  const [projectRoles, setProjectRoles] = useState<Record<string, ProjectRole>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<InviteBatchResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { emails, invalid } = useMemo(() => parseEmails(rawEmails), [rawEmails]);

  const workspaceRoleOptions = useMemo(
    () =>
      grantableWorkspaceRoles(capabilities.role).map((value) => ({
        label: t(WORKSPACE_ROLE_LABEL[value]),
        value,
      })),
    [capabilities.role, t],
  );

  const projectOptions = useMemo(
    () => projects.map((project) => ({ label: project.name, value: project.id })),
    [projects],
  );

  const projectRoleOptions = useMemo(
    () =>
      PROJECT_ROLE_ORDER.map((value) => ({
        label: t(PROJECT_ROLE_LABEL[value]),
        value,
      })),
    [t],
  );

  const setProjectRole = useCallback((projectId: string, value: ProjectRole) => {
    setProjectRoles((current) => ({ ...current, [projectId]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (emails.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const batch = await invite({
        emails,
        projectIds: projectIds.length ? projectIds : undefined,
        projectRoles: projectIds.length
          ? projectIds.map((projectId) => ({
              projectId,
              role: projectRoles[projectId] ?? 'contributor',
            }))
          : undefined,
        role,
      });
      setResult(batch);
      void mutate(teammatesKeys.invitations());
      void mutate(teammatesKeys.members(false));
      if (batch.results.every((entry) => entry.ok && entry.emailed !== false)) {
        // All delivered — the caller sees the green state briefly before close.
        // `emailed === false` rows stay open: the invite exists but the mail
        // never left, so the admin must see the warning and resend.
        setTimeout(close, 400);
      }
    } catch (error) {
      console.error('[Teammates] invite failed', error);
      setSubmitError((error as Error)?.message || t('workspaceSetting.members.actionFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [emails, invite, projectIds, projectRoles, role, submitting, close, t]);

  const canSubmit = emails.length > 0 && !submitting && capabilities.canInvite;

  return (
    <Flexbox className={styles.body} gap={16}>
      <Alert showIcon={false} title={t('workspaceSetting.members.scopeExplainer')} type="info" />

      <Flexbox className={styles.field}>
        <Text fontSize={13} weight={500}>
          {t('workspaceSetting.members.emailsLabel')}
        </Text>
        <TextArea
          autoFocus
          placeholder={t('workspaceSetting.members.emailsPlaceholder')}
          rows={3}
          value={rawEmails}
          onChange={(event) => setRawEmails(event.target.value)}
        />
        {invalid.length > 0 && (
          <Text fontSize={12} type="danger">
            {t('workspaceSetting.members.invalidEmails', { emails: invalid.join(', ') })}
          </Text>
        )}
        {emails.length > 0 && (
          <Text fontSize={12} type="secondary">
            {t('workspaceSetting.members.emailCount', { count: emails.length })}
          </Text>
        )}
      </Flexbox>

      <Flexbox className={styles.field}>
        <Text fontSize={13} weight={500}>
          {t('workspaceSetting.members.workspaceRoleLabel')}
        </Text>
        <Select
          options={workspaceRoleOptions}
          value={role}
          onChange={(value) => setRole(value as WorkspaceRole)}
        />
      </Flexbox>

      <Flexbox className={styles.field}>
        <Text fontSize={13} weight={500}>
          {t('workspaceSetting.members.projectsLabel')}
        </Text>
        <Select
          allowClear
          mode="multiple"
          options={projectOptions}
          placeholder={t('workspaceSetting.members.projectsPlaceholder')}
          value={projectIds}
          onChange={(value) => setProjectIds(value as string[])}
        />
        {projectIds.map((projectId) => {
          const project = projects.find((item) => item.id === projectId);
          return (
            <Flexbox horizontal align="center" gap={8} justify="space-between" key={projectId}>
              <Text fontSize={13}>{project?.name ?? projectId}</Text>
              <Select
                options={projectRoleOptions}
                size="small"
                style={{ width: 160 }}
                value={projectRoles[projectId] ?? 'contributor'}
                onChange={(value) => setProjectRole(projectId, value as ProjectRole)}
              />
            </Flexbox>
          );
        })}
      </Flexbox>

      {submitError && <Alert title={submitError} type="error" />}

      {result && (
        <Flexbox className={styles.resultList}>
          {result.results.map((entry) => {
            // `ok` + `emailed === false` = the row exists but nothing was sent —
            // distinct from both success and failure, so it needs its own look.
            const emailFailed = entry.ok && entry.emailed === false;
            return (
              <div className={styles.emailResult} key={entry.email}>
                <Icon
                  color={
                    emailFailed
                      ? cssVar.colorWarning
                      : entry.ok
                        ? cssVar.colorSuccess
                        : cssVar.colorError
                  }
                  icon={emailFailed ? TriangleAlert : entry.ok ? CheckCircle2 : XCircle}
                  size={14}
                />
                <Text fontSize={12} type={entry.ok ? undefined : 'danger'}>
                  {emailFailed
                    ? t('workspaceSetting.members.inviteEmailFailed', { email: entry.email })
                    : entry.ok
                      ? t('workspaceSetting.members.inviteSent', { email: entry.email })
                      : t('workspaceSetting.members.inviteFailed', {
                          email: entry.email,
                          error: entry.error ?? '',
                        })}
                </Text>
              </div>
            );
          })}
        </Flexbox>
      )}

      <ModalFooter>
        <Button onClick={close}>{t('cancel', { ns: 'common' })}</Button>
        <Button disabled={!canSubmit} loading={submitting} type="primary" onClick={handleSubmit}>
          {t('workspaceSetting.members.inviteAction', { count: emails.length })}
        </Button>
      </ModalFooter>
    </Flexbox>
  );
});

InviteTeammateContent.displayName = 'InviteTeammateContent';

export default InviteTeammateContent;
