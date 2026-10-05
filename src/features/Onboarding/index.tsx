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
import { isDesktop } from '@/const/version';
import CreateAgentPanel from '@/features/CreateAgent/CreateAgentPanel';
import { isBuiltinEngineType } from '@/features/HeterogeneousAgent/engine';
import { agentService } from '@/services/agent';
import { ensureFirstAgentInWorkspace } from '@/services/agentOnboarding';
import { useUserStore } from '@/store/user';
import {
  clearStaleOnboardingCallbackUrl,
  resolvePostOnboardingTargetUrl,
  stashOnboardingCallbackUrl,
} from '@/utils/onboardingRedirect';

import DesktopAuthGate from './DesktopAuthGate';
import { finishOnboardingAndNavigate, repairDesktopOnboardingMarkers } from './finishOnboarding';
import { useOnboardingUserStateReady } from './useOnboardingUserStateReady';
import { resolveOnboardingWorkspace } from './workspaceResolution';

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
  const [error, setError] = useState<unknown>();
  const [firstAgentId, setFirstAgentId] = useState(setup?.firstAgentId);

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

  const continueWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !workspaceName.trim() || !workspaceSlug.trim() || workspaceSlugError) return;
    setBusy(true);
    setError(undefined);
    try {
      const resolved = await resolveOnboardingWorkspace(
        { workspaceName, workspaceSlug },
        useUserStore.getState().onboarding?.setup?.workspaceId,
        createdWorkspaceRef,
        saveWorkspace,
      );
      createdWorkspaceRef.current = resolved;
      await saveWorkspace(resolved);
      setWorkspace(resolved);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  };

  const completeAgent = async (agentId: string) => {
    if (!workspace) return;
    setFirstAgentId(agentId);
    setBusy(true);
    setError(undefined);
    try {
      const state = useUserStore.getState();
      // Keep the created identity before verification so a failed check resumes
      // this agent instead of inviting the user to create another one.
      await state.updateOnboarding({
        setup: { ...state.onboarding?.setup, firstAgentId: agentId },
      });
      const saved = await agentService.getAgentConfigById(agentId);
      if (!saved?.agencyConfig?.heterogeneousProvider) throw new Error('FIRST_AGENT_REQUIRED');
      const executionTarget =
        isDesktop &&
        saved.agencyConfig.executionTarget === 'local' &&
        !isBuiltinEngineType(saved.agencyConfig.heterogeneousProvider.type)
          ? 'local'
          : 'device';
      const boundDeviceId = saved.agencyConfig.boundDeviceId;
      await state.updateOnboarding({
        setup: {
          ...useUserStore.getState().onboarding?.setup,
          firstAgentId: agentId,
          firstAgentDeviceId: boundDeviceId,
          firstAgentExecutionTarget: executionTarget,
        },
      });
      await finishOnboardingAndNavigate(
        state.finishOnboarding,
        navigate,
        () =>
          ensureFirstAgentInWorkspace(agentId, workspace.id, { executionTarget, boundDeviceId }),
        agentId,
      );
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="orvilo-entry-surface bg-background text-foreground flex min-h-[var(--onboarding-viewport-height,100svh)] w-full flex-col">
      <OnboardingHeader
        canGoBack={false}
        currentStep={workspace ? 2 : 1}
        totalSteps={2}
        onBack={() => {}}
      />
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-10">
        <ol
          aria-label={t('setup.steps')}
          className="text-muted-foreground flex justify-center gap-6 text-sm"
        >
          <li
            aria-current={!workspace ? 'step' : undefined}
            className={!workspace ? 'text-foreground font-medium' : ''}
          >
            {t('setup.step.workspace')}
          </li>
          <li
            aria-current={workspace ? 'step' : undefined}
            className={workspace ? 'text-foreground font-medium' : ''}
          >
            {t('setup.step.agent')}
          </li>
        </ol>
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t(workspace ? 'setup.agent.title' : 'setup.workspace.title')}
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            {t(workspace ? 'setup.agent.description' : 'setup.workspace.description')}
          </p>
        </div>
        {error !== undefined && <AsyncError error={error} />}
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
              type="submit"
              disabled={
                busy || !workspaceName.trim() || !workspaceSlug.trim() || !!workspaceSlugError
              }
            >
              {busy && <Spinner data-icon="inline-start" />}
              {t('reui.action.continue')}
            </Button>
          </form>
        ) : firstAgentId ? (
          <Button disabled={busy} onClick={() => void completeAgent(firstAgentId)}>
            {busy && <Spinner data-icon="inline-start" />}
            {t(busy ? 'setup.agent.verifying' : 'setup.agent.enter')}
          </Button>
        ) : (
          <CreateAgentPanel lockVisibility onCreated={completeAgent} />
        )}
        {workspace && error !== undefined && (
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
