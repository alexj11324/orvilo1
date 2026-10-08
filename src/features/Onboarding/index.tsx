'use client';

import '@/app/globals.css';

import { WORKSPACE_SLUG_MAX, WORKSPACE_SLUG_MIN } from '@orvilo/const';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import AsyncError from '@/components/AsyncError';
import { OnboardingHeader } from '@/components/blocks/onboarding-2/components/onboarding-header';
import { useWorkspaceSlug } from '@/components/blocks/onboarding-2/components/useWorkspaceSlug';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import CreateAgentPanel from '@/features/CreateAgent/CreateAgentPanel';
import ConfiguredOrchestratorSelector from '@/features/Orchestrator/ConfiguredOrchestratorSelector';
import { ensureFirstAgentInWorkspace } from '@/services/agentOnboarding';
import {
  getOnboardingAgentConfig,
  resolveOnboardingAgentHost,
  verifyOnboardingOrchestrator,
} from '@/services/orchestrator';
import { useUserStore } from '@/store/user';
import {
  clearStaleOnboardingCallbackUrl,
  resolvePostOnboardingTargetUrl,
  stashOnboardingCallbackUrl,
} from '@/utils/onboardingRedirect';

import DesktopAuthGate from './DesktopAuthGate';
import { type OnboardingAction, resolveOnboardingErrorCopy } from './errorCopy';
import { finishOnboardingAndNavigate, repairDesktopOnboardingMarkers } from './finishOnboarding';
import { useOnboardingUserStateReady } from './useOnboardingUserStateReady';
import { resolveOnboardingWorkspace } from './workspaceResolution';

const SETUP_STEPS = [
  'setup.stepName.workspace',
  'setup.stepName.agent',
  'setup.stepName.orchestrator',
] as const;

function OnboardingSetup() {
  const { t } = useTranslation('onboarding');
  const { t: tSetting } = useTranslation('setting');
  const navigate = useNavigate();
  const setup = useUserStore((s) => s.onboarding?.setup);
  const {
    workspaceName,
    workspaceSlug,
    workspaceSlugError,
    onWorkspaceNameChange,
    onWorkspaceSlugChange,
  } = useWorkspaceSlug(setup?.workspaceName, setup?.workspaceSlug);
  const [workspace, setWorkspace] = useState<{ id: string; slug: string }>();
  const createdWorkspaceRef = useRef<{ id: string; slug: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [failure, setFailure] = useState<{ action: OnboardingAction; error: unknown }>();
  const [firstAgentId, setFirstAgentId] = useState(setup?.firstAgentId);
  const [agentVerified, setAgentVerified] = useState(false);
  const [orchestratorAgentId, setOrchestratorAgentId] = useState(setup?.orchestratorAgentId);
  const [orchestratorReady, setOrchestratorReady] = useState(false);

  const saveWorkspace = async (candidate: { id: string; slug: string }) => {
    const state = useUserStore.getState();
    await state.updateOnboarding({
      setup: {
        ...state.onboarding?.setup,
        workspaceId: candidate.id,
        workspaceName: workspaceName.trim(),
        workspaceSlug: candidate.slug,
      },
    });
  };

  /**
   * Run one setup action with a busy state and a failure that names the action and can
   * be retried. `exclusive` also drops a second call while one is still in flight, which
   * keeps a double click from submitting twice before `busy` re-renders.
   */
  const runAction = async (
    action: OnboardingAction,
    task: () => Promise<void>,
    exclusive = true,
  ) => {
    if (exclusive && inFlight.current) return;
    if (exclusive) inFlight.current = true;
    setBusy(true);
    setFailure(undefined);
    try {
      await task();
    } catch (error) {
      setFailure({ action, error });
    } finally {
      if (exclusive) inFlight.current = false;
      setBusy(false);
    }
  };

  const continueWorkspace = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || !workspaceName.trim() || !workspaceSlug.trim() || workspaceSlugError) return;
    await runAction('workspace', async () => {
      const resolved = await resolveOnboardingWorkspace(
        { workspaceName, workspaceSlug },
        useUserStore.getState().onboarding?.setup?.workspaceId,
        createdWorkspaceRef,
        saveWorkspace,
      );
      createdWorkspaceRef.current = resolved;
      await saveWorkspace(resolved);
      setWorkspace(resolved);
    });
  };

  const completeAgent = async (agentId: string) => {
    if (!workspace) return;
    setFirstAgentId(agentId);
    await runAction('agent', async () => {
      const state = useUserStore.getState();
      // Keep the created identity before verification so a failed check resumes
      // this agent instead of inviting the user to create another one.
      await state.updateOnboarding({
        setup: { ...state.onboarding?.setup, firstAgentId: agentId },
      });
      const saved = await getOnboardingAgentConfig(agentId, workspace.id);
      if (!saved?.agencyConfig?.heterogeneousProvider) throw new Error('FIRST_AGENT_REQUIRED');
      const { executionTarget, boundDeviceId } = resolveOnboardingAgentHost(saved.agencyConfig);
      await state.updateOnboarding({
        setup: {
          ...useUserStore.getState().onboarding?.setup,
          firstAgentId: agentId,
          firstAgentDeviceId: boundDeviceId,
          firstAgentExecutionTarget: executionTarget,
        },
      });
      await ensureFirstAgentInWorkspace(agentId, workspace.id, { executionTarget, boundDeviceId });
      const selectedId = useUserStore.getState().onboarding?.setup?.orchestratorAgentId ?? agentId;
      await state.updateOnboarding({
        setup: { ...useUserStore.getState().onboarding?.setup, orchestratorAgentId: selectedId },
      });
      setOrchestratorAgentId(selectedId);
      setAgentVerified(true);
    });
  };

  const selectOrchestrator = async (agentId: string) => {
    setOrchestratorAgentId(agentId);
    setOrchestratorReady(false);
    // Not exclusive: the selector reports its own initial selection on mount.
    await runAction(
      'selection',
      async () => {
        const state = useUserStore.getState();
        await state.updateOnboarding({
          setup: { ...state.onboarding?.setup, orchestratorAgentId: agentId },
        });
        setOrchestratorReady(true);
      },
      false,
    );
  };

  const finish = async () => {
    if (!workspace || !orchestratorAgentId || !orchestratorReady || busy) return;
    await runAction('finish', async () => {
      const state = useUserStore.getState();
      await state.updateOnboarding({
        setup: { ...state.onboarding?.setup, orchestratorAgentId },
      });
      await finishOnboardingAndNavigate(
        state.finishOnboarding,
        navigate,
        () => verifyOnboardingOrchestrator(orchestratorAgentId, workspace.id),
        firstAgentId,
      );
    });
  };

  const stepIndex = agentVerified ? 2 : workspace ? 1 : 0;
  const errorCopy = failure && resolveOnboardingErrorCopy(failure.action, failure.error);
  const retry = failure
    ? {
        agent: firstAgentId ? () => void completeAgent(firstAgentId) : undefined,
        finish: () => void finish(),
        selection: orchestratorAgentId
          ? () => void selectOrchestrator(orchestratorAgentId)
          : undefined,
        workspace: () => void continueWorkspace(),
      }[failure.action]
    : undefined;

  return (
    <main className="orvilo-entry-surface bg-background text-foreground flex min-h-[var(--onboarding-viewport-height,100svh)] w-full flex-col">
      <OnboardingHeader canGoBack={false} onBack={() => {}} />
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-10">
        <ol
          aria-label={t('setup.steps')}
          className="text-muted-foreground flex justify-center gap-6 text-sm"
        >
          {SETUP_STEPS.map((label, index) => (
            <li
              aria-current={index === stepIndex ? 'step' : undefined}
              className={index === stepIndex ? 'text-foreground font-medium' : ''}
              key={label}
            >
              {index + 1} {t(label)}
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t(
              agentVerified
                ? 'setup.orchestrator.title'
                : workspace
                  ? 'setup.agent.title'
                  : 'setup.workspace.title',
            )}
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            {t(
              agentVerified
                ? 'setup.orchestrator.description'
                : workspace
                  ? 'setup.agent.description'
                  : 'setup.workspace.description',
            )}
          </p>
        </div>
        {failure && (
          <div role="alert">
            <AsyncError
              description={errorCopy && t(errorCopy.descriptionKey)}
              error={failure.error}
              retrying={busy}
              title={errorCopy && t(errorCopy.titleKey)}
              onRetry={retry}
            />
          </div>
        )}
        {!workspace ? (
          <form
            className="mx-auto flex w-full max-w-sm flex-col gap-5"
            onSubmit={continueWorkspace}
          >
            <Field>
              <FieldLabel htmlFor="onboarding-workspace">{t('reui.workspace.name')}</FieldLabel>
              <Input
                required
                autoComplete="organization"
                className="h-9"
                disabled={busy}
                id="onboarding-workspace"
                value={workspaceName}
                onChange={(e) => onWorkspaceNameChange(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="onboarding-url">{t('reui.workspace.url')}</FieldLabel>
              <Input
                required
                aria-describedby={workspaceSlugError ? 'onboarding-url-error' : undefined}
                aria-invalid={!!workspaceSlugError}
                autoComplete="off"
                className="h-9"
                disabled={busy}
                id="onboarding-url"
                value={workspaceSlug}
                onChange={(e) => onWorkspaceSlugChange(e.target.value)}
              />
              <FieldDescription>
                {t('reui.workspace.urlDescription', { slug: workspaceSlug.trim() || 'workspace' })}
              </FieldDescription>
              {workspaceSlugError && (
                <FieldError id="onboarding-url-error">
                  {tSetting(`workspace.wizard.step1.slug.${workspaceSlugError}`, {
                    min: WORKSPACE_SLUG_MIN,
                    max: WORKSPACE_SLUG_MAX,
                  })}
                </FieldError>
              )}
            </Field>
            <Button
              loading={busy}
              size="lg"
              type="submit"
              disabled={
                busy || !workspaceName.trim() || !workspaceSlug.trim() || !!workspaceSlugError
              }
            >
              {t('reui.action.continue')}
            </Button>
          </form>
        ) : agentVerified ? (
          <>
            <ConfiguredOrchestratorSelector
              disabled={busy}
              value={orchestratorAgentId}
              workspaceId={workspace.id}
              onSelect={(id) => void selectOrchestrator(id)}
              onUnavailable={() => setOrchestratorReady(false)}
              onCreated={async (id) => {
                const saved = await getOnboardingAgentConfig(id, workspace.id);
                const { executionTarget, boundDeviceId } = resolveOnboardingAgentHost(
                  saved?.agencyConfig,
                );
                await ensureFirstAgentInWorkspace(id, workspace.id, {
                  executionTarget,
                  boundDeviceId,
                });
              }}
            />
            <Button
              disabled={busy || !orchestratorReady}
              loading={busy}
              size="lg"
              onClick={() => void finish()}
            >
              {t('setup.orchestrator.finish')}
            </Button>
          </>
        ) : firstAgentId ? (
          <Button
            disabled={busy}
            loading={busy}
            size="lg"
            onClick={() => void completeAgent(firstAgentId)}
          >
            {t(busy ? 'setup.agent.verifying' : 'setup.agent.enter')}
          </Button>
        ) : (
          <CreateAgentPanel lockVisibility onCreated={completeAgent} />
        )}
        {workspace && failure && (
          <div className="flex justify-center gap-2">
            <Button variant="ghost" onClick={() => navigate('/settings/provider')}>
              {t('setup.provider')}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/settings/devices')}>
              {t('setup.devices')}
            </Button>
          </div>
        )}
        {workspace && (
          <Button disabled={busy} variant="ghost" onClick={() => navigate('/settings/profile')}>
            {t('setup.account')}
          </Button>
        )}
      </div>
    </main>
  );
}

function OnboardingPage() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const ready = useOnboardingUserStateReady();
  const error = useUserStore((s) => s.isUserStateInitError);
  const refresh = useUserStore((s) => s.refreshUserState);
  const finished = useUserStore((s) => !!s.onboarding?.finishedAt);
  useEffect(() => {
    stashOnboardingCallbackUrl(search);
    clearStaleOnboardingCallbackUrl(pathname, search);
  }, [pathname, search]);
  useEffect(() => {
    if (!finished) return;
    void repairDesktopOnboardingMarkers();
    navigate(resolvePostOnboardingTargetUrl(), { replace: true });
  }, [finished, navigate]);
  return (
    <DesktopAuthGate>
      {!ready ? (
        <div className="flex min-h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : error ? (
        <AsyncError error={error} onRetry={() => void refresh()} />
      ) : finished ? null : (
        <OnboardingSetup />
      )}
    </DesktopAuthGate>
  );
}

export default OnboardingPage;
