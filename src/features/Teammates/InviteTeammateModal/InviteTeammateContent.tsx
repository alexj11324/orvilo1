'use client';

import { cn } from 'cn';
import { CheckCircle2, TriangleAlert, XCircle } from 'lucide-react';
import { createElement, memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import { ModalFooter, useModalContext } from '@/components/Modal';
import Select from '@/components/Select';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { mutate } from '@/libs/swr';
import { useCurrentProjectList, useProjectStore } from '@/store/project';

import type { InviteBatchResult, ProjectRole, WorkspaceRole } from '../api/contract';
import { useTeammateActions } from '../api/hooks';
import { teammatesKeys } from '../api/keys';
import { grantableWorkspaceRoles, PROJECT_ROLE_ORDER } from '../api/roleCapabilities';

const styles = {
  body: 'pt-0 pb-4 px-5',
  emailResult: 'flex gap-1.5 items-start text-sm leading-5.5',
  field: 'flex flex-col gap-1.5',
  resultList: 'flex flex-col gap-1',
};

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
    <div className={cn(styles.body, 'flex flex-col gap-4')}>
      <Alert className="rounded-(--radius-card) text-sm leading-5.5" variant="info">
        <AlertTitle className="line-clamp-none text-sm leading-5.5 tracking-normal">
          {t('workspaceSetting.members.scopeExplainer')}
        </AlertTitle>
      </Alert>

      <div className={cn(styles.field, 'flex flex-col')}>
        <div className="text-sm leading-5.5 font-medium">
          {t('workspaceSetting.members.emailsLabel')}
        </div>
        <Textarea
          autoFocus
          className="rounded-(--radius-input) text-sm leading-5.5 md:text-sm"
          placeholder={t('workspaceSetting.members.emailsPlaceholder')}
          rows={3}
          value={rawEmails}
          onChange={(event) => setRawEmails(event.target.value)}
        />
        {invalid.length > 0 && (
          <div className="text-xs leading-5 text-destructive-text">
            {t('workspaceSetting.members.invalidEmails', { emails: invalid.join(', ') })}
          </div>
        )}
        {emails.length > 0 && (
          <div className="text-xs leading-5 text-muted-foreground">
            {t('workspaceSetting.members.emailCount', { count: emails.length })}
          </div>
        )}
      </div>

      <div className={cn(styles.field, 'flex flex-col')}>
        <div className="text-sm leading-5.5 font-medium">
          {t('workspaceSetting.members.workspaceRoleLabel')}
        </div>
        <Select
          options={workspaceRoleOptions}
          size="normal"
          value={role}
          onChange={(value) => setRole(value as WorkspaceRole)}
        />
      </div>

      <div className={cn(styles.field, 'flex flex-col')}>
        <div className="text-sm leading-5.5 font-medium">
          {t('workspaceSetting.members.projectsLabel')}
        </div>
        <Select
          allowClear
          mode="multiple"
          options={projectOptions}
          placeholder={t('workspaceSetting.members.projectsPlaceholder')}
          size="normal"
          value={projectIds}
          onChange={(value) => setProjectIds(value as string[])}
        />
        {projectIds.map((projectId) => {
          const project = projects.find((item) => item.id === projectId);
          return (
            <div className="flex items-center gap-2 justify-between" key={projectId}>
              <div className="text-sm leading-5.5">{project?.name ?? projectId}</div>
              <Select
                className="w-40"
                options={projectRoleOptions}
                size="normal"
                value={projectRoles[projectId] ?? 'contributor'}
                onChange={(value) => setProjectRole(projectId, value as ProjectRole)}
              />
            </div>
          );
        })}
      </div>

      {submitError && (
        <Alert className="rounded-(--radius-card) text-sm leading-5.5" variant="destructive">
          <AlertTitle className="line-clamp-none text-sm leading-5.5 tracking-normal">
            {submitError}
          </AlertTitle>
        </Alert>
      )}

      {result && (
        <div className={cn(styles.resultList, 'flex flex-col')}>
          {result.results.map((entry) => {
            // `ok` + `emailed === false` = the row exists but nothing was sent —
            // distinct from both success and failure, so it needs its own look.
            const emailFailed = entry.ok && entry.emailed === false;
            return (
              <div className={styles.emailResult} key={entry.email}>
                {createElement(emailFailed ? TriangleAlert : entry.ok ? CheckCircle2 : XCircle, {
                  className: cn(
                    'mt-1 shrink-0',
                    emailFailed
                      ? 'text-warning-text'
                      : entry.ok
                        ? 'text-success-text'
                        : 'text-destructive-text',
                  ),
                  size: 14,
                })}
                <div
                  className={cn(
                    'text-sm leading-5.5',
                    emailFailed
                      ? 'text-warning-text'
                      : entry.ok
                        ? 'text-success-text'
                        : 'text-destructive-text',
                  )}
                >
                  {emailFailed
                    ? t('workspaceSetting.members.inviteEmailFailed', { email: entry.email })
                    : entry.ok
                      ? t('workspaceSetting.members.inviteSent', { email: entry.email })
                      : t('workspaceSetting.members.inviteFailed', {
                          email: entry.email,
                          error: entry.error ?? '',
                        })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ModalFooter className="p-0">
        <Button size="lg" onClick={close}>
          {t('cancel', { ns: 'common' })}
        </Button>
        <Button
          disabled={!canSubmit}
          loading={submitting}
          size="lg"
          variant="default"
          onClick={handleSubmit}
        >
          {t('workspaceSetting.members.inviteAction', { count: emails.length })}
        </Button>
      </ModalFooter>
    </div>
  );
});

InviteTeammateContent.displayName = 'InviteTeammateContent';

export default InviteTeammateContent;
