'use client';

import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Cable,
  Check,
  Hash,
  Pencil,
  Plus,
  Slack,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { confirmModal } from '@/components/Modal';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { SlackOAuthMode } from '@/services/slackIntegration';
import { slackIntegrationService } from '@/services/slackIntegration';

import { authorizeSlack } from './authorize';
import { openSlackBindingForm } from './BindingForm';
import { useFetchSlackIntegration } from './hooks';

type OAuthErrorKey =
  | 'integrations.slack.oauth.failed'
  | 'integrations.slack.oauth.popupBlocked'
  | 'integrations.slack.oauth.timedOut'
  | 'integrations.slack.oauth.dismissed';

const SlackMark = () => (
  <div className="flex size-12 flex-none items-center justify-center rounded-lg border border-border bg-background">
    <Slack aria-hidden className="size-7 text-foreground" />
  </div>
);
export const IntegrationsSettings = ({ detail = false }: { detail?: boolean }) => {
  const { t } = useTranslation('setting');
  const { workspaceSlug } = useParams();
  const workspaceId = useActiveWorkspaceId();
  const request = useFetchSlackIntegration(workspaceId);
  const { data, error, isLoading, isValidating, mutate } = request;
  const [oauthMode, setOAuthMode] = useState<SlackOAuthMode | null>(null);
  const [oauthError, setOAuthError] = useState<OAuthErrorKey | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [writeError, setWriteError] = useState(false);
  const authController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      authController.current?.abort();
    },
    [workspaceId],
  );
  const connect = async (mode: SlackOAuthMode) => {
    if (
      !workspaceId ||
      !data?.configured ||
      (mode === 'workspace' && !data.canManage) ||
      authController.current
    )
      return;
    const controller = new AbortController();
    authController.current = controller;
    setOAuthMode(mode);
    setOAuthError(null);
    try {
      const result = await authorizeSlack(workspaceId, mode, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === 'success') {
        const refreshed = await mutate();
        if (!(mode === 'workspace' ? refreshed?.installation : refreshed?.personalConnection))
          setOAuthError('integrations.slack.oauth.failed');
      } else if (result.status !== 'cancelled')
        setOAuthError(
          result.error === 'popup_blocked'
            ? 'integrations.slack.oauth.popupBlocked'
            : result.status === 'timed-out'
              ? 'integrations.slack.oauth.timedOut'
              : result.status === 'dismissed'
                ? 'integrations.slack.oauth.dismissed'
                : 'integrations.slack.oauth.failed',
        );
    } catch (error) {
      console.error('Slack OAuth failed', error);
      if (!controller.signal.aborted) setOAuthError('integrations.slack.oauth.failed');
    } finally {
      if (authController.current === controller) {
        authController.current = null;
        setOAuthMode(null);
      }
    }
  };
  const runWrite = async (key: string, operation: () => Promise<unknown>) => {
    if (pending) return;
    setPending(key);
    setWriteError(false);
    try {
      await operation();
      await mutate();
    } catch (error) {
      console.error('Slack integration write failed', error);
      setWriteError(true);
      throw error;
    } finally {
      setPending(null);
    }
  };
  const connected = Boolean(data?.installation);
  const basePath = `/${workspaceSlug}/settings/integrations`;
  const disabled = Boolean(pending || oauthMode);
  return (
    <div className="flex flex-col gap-7">
      {detail ? (
        <Link className="flex items-center gap-2 text-sm text-muted-foreground" to={basePath}>
          <ArrowLeft size={16} />
          {t('integrations.back')}
        </Link>
      ) : (
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{t('workspaceSetting.tab.integrations')}</h1>
          <p className="text-sm text-muted-foreground">{t('integrations.description')}</p>
        </div>
      )}
      {!detail && error && (
        <AsyncError
          error={error}
          retrying={isValidating}
          variant="inline"
          onRetry={() => {
            void mutate();
          }}
        />
      )}
      {!detail ? (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-medium">{t('integrations.apps')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('integrations.appsDescription')}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-secondary p-5">
            <div className="flex items-center gap-4">
              <SlackMark />
              <div>
                <h3 className="font-semibold">Slack</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('integrations.slack.description')}
                </p>
              </div>
            </div>
            <Button render={<Link to={`${basePath}/slack`} />} variant="outline">
              {t('integrations.configure')}
              <ArrowRight size={16} />
            </Button>
          </div>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-secondary p-5">
            <div className="flex items-center gap-4">
              <SlackMark />
              <div>
                <h1 className="text-base font-semibold">Slack</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('integrations.slack.description')}
                </p>
              </div>
            </div>
            {connected ? (
              <Badge variant="success-light">
                <Check size={14} />
                {t('integrations.connected')}
              </Badge>
            ) : (
              <Button
                loading={oauthMode === 'workspace'}
                disabled={
                  disabled || !data?.configured || !data.canManage || isLoading || Boolean(error)
                }
                onClick={() => {
                  void connect('workspace');
                }}
              >
                {t('integrations.install')}
              </Button>
            )}
          </div>
          {!workspaceId && (
            <p className="text-sm text-muted-foreground">{t('integrations.workspaceRequired')}</p>
          )}
          {isLoading && (
            <div
              aria-label={t('integrations.loading')}
              className="flex flex-col gap-3"
              role="status"
            >
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {error && (
            <AsyncError
              error={error}
              retrying={isValidating}
              variant={data ? 'inline' : 'block'}
              onRetry={() => {
                void mutate();
              }}
            />
          )}
          {data && !data.configured && (
            <div className="rounded-lg border border-border p-5">
              <h2 className="font-medium">{t('integrations.slack.unconfiguredTitle')}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('integrations.slack.unconfigured')}
              </p>
              <Button
                className="mt-3"
                loading={isValidating}
                variant="outline"
                onClick={() => {
                  void mutate();
                }}
              >
                {t('integrations.refresh')}
              </Button>
            </div>
          )}
          {data && !data.canManage && (
            <p className="text-sm text-muted-foreground">{t('integrations.slack.adminRequired')}</p>
          )}
          {oauthMode && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
              role="status"
            >
              <span className="text-sm">{t('integrations.slack.oauth.waiting')}</span>
              <Button
                variant="outline"
                onClick={() => {
                  authController.current?.abort();
                }}
              >
                {t('integrations.slack.oauth.stopWaiting')}
              </Button>
            </div>
          )}
          {oauthError && (
            <p className="text-sm text-destructive-text" role="alert">
              {t(oauthError)}
            </p>
          )}
          {writeError && (
            <p className="text-sm text-destructive-text" role="alert">
              {t('integrations.slack.writeFailed')}
            </p>
          )}
          {data && data.configured && (
            <>
              <section className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
                <div>
                  <h2 className="text-sm font-medium">{t('integrations.slack.personalTitle')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.personalConnection
                      ? t('integrations.slack.personalConnected', {
                          name:
                            data.personalConnection.displayName ||
                            data.personalConnection.slackUserId,
                        })
                      : t('integrations.slack.personalDescription')}
                  </p>
                </div>
                {data.personalConnection ? (
                  <Button
                    disabled={disabled}
                    loading={pending === 'personal'}
                    variant="outline"
                    onClick={() => {
                      void runWrite('personal', () =>
                        slackIntegrationService.disconnectPersonal(workspaceId!),
                      ).catch((error) => console.error(error));
                    }}
                  >
                    {t('integrations.disconnect')}
                  </Button>
                ) : (
                  <Button
                    disabled={!connected || disabled}
                    loading={oauthMode === 'personal'}
                    variant="outline"
                    onClick={() => {
                      void connect('personal');
                    }}
                  >
                    {t('integrations.connect')}
                  </Button>
                )}
              </section>
              <section className="flex flex-col gap-3">
                <h2 className="font-medium">{t('integrations.slack.workspaces')}</h2>
                {data.installation ? (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4">
                    <div>
                      <p className="text-sm font-medium">{data.installation.teamName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('integrations.slack.workspaceConnected')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="success-light">{t('integrations.connected')}</Badge>
                      <Button
                        disabled={!data.canManage || disabled}
                        loading={pending === 'workspace'}
                        variant="outline"
                        onClick={() =>
                          confirmModal({
                            title: t('integrations.slack.disconnectTitle'),
                            content: t('integrations.slack.disconnectDescription'),
                            okText: t('integrations.disconnect'),
                            cancelText: t('integrations.cancel'),
                            okButtonProps: { danger: true },
                            onOk: () =>
                              runWrite('workspace', () =>
                                slackIntegrationService.disconnect(workspaceId!),
                              ),
                          })
                        }
                      >
                        {t('integrations.disconnect')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('integrations.slack.notConnected')}
                  </p>
                )}
              </section>
              <section className="overflow-hidden rounded-lg border border-border">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary p-4">
                  <div>
                    <h2 className="text-sm font-medium">{t('integrations.slack.connections')}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('integrations.slack.connectionsDescription')}
                    </p>
                  </div>
                  <Button
                    disabled={!connected || !data.canManage || disabled}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      openSlackBindingForm({ workspaceId: workspaceId!, onSaved: () => mutate() })
                    }
                  >
                    <Plus size={16} />
                    {t('integrations.add')}
                  </Button>
                </div>
                {data.bindings.length ? (
                  <div className="flex flex-col gap-3 p-4">
                    {data.bindings.map((binding) => (
                      <div
                        className="flex flex-col gap-3 rounded-lg border border-border p-3"
                        key={binding.id}
                      >
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <span className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-secondary p-3">
                            <Hash className="size-4 shrink-0" />
                            <span className="break-all">{binding.slackChannelName}</span>
                          </span>
                          <ArrowRight size={16} />
                          <span className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-secondary p-3">
                            <Bot className="size-4 shrink-0" />
                            <span className="break-all">{binding.agentName}</span>
                          </span>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            disabled={!data.canManage || disabled}
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              openSlackBindingForm({
                                workspaceId: workspaceId!,
                                binding,
                                onSaved: () => mutate(),
                              })
                            }
                          >
                            <Pencil size={14} />
                            {t('integrations.edit')}
                          </Button>
                          <Button
                            disabled={!data.canManage || disabled}
                            loading={pending === binding.id}
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              void runWrite(binding.id, () =>
                                slackIntegrationService.deleteBinding(workspaceId!, binding.id),
                              ).catch((error) => console.error(error));
                            }}
                          >
                            <Trash2 size={14} />
                            {t('integrations.delete')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <Cable className="text-muted-foreground" size={20} />
                    <p className="text-sm text-muted-foreground">
                      {t('integrations.slack.emptyConnections')}
                    </p>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
};
