'use client';

import '@/app/globals.css';

import { type UserOnboardingSetup } from '@orvilo/types';
import { memo, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import AsyncError from '@/components/AsyncError';
import { type InviteRoleValue } from '@/components/blocks/onboarding-2/components/data';
import {
  Onboarding,
  ONBOARDING_INVITES_FAILED,
  type OnboardingFormValues,
} from '@/components/blocks/onboarding-2/components/onboarding';
import { OnboardingHeader } from '@/components/blocks/onboarding-2/components/onboarding-header';
import { Spinner } from '@/components/ui/spinner';
import { isDesktop } from '@/const/version';
import AgentOnboarding from '@/features/AgentOnboarding';
import { isBuiltinAgentUsable } from '@/features/AgentOnboarding/availability';
import { isBuiltinEngineType } from '@/features/HeterogeneousAgent/engine';
import { createWorkspaceLambdaClient } from '@/libs/trpc/client';
import { agentService } from '@/services/agent';
import { ensureFirstAgentInWorkspace, verifyFirstAgentDevice } from '@/services/agentOnboarding';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { useProviderBindingStore } from '@/store/providerBinding';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
import {
  clearStaleOnboardingCallbackUrl,
  resolvePostOnboardingTargetUrl,
  stashOnboardingCallbackUrl,
} from '@/utils/onboardingRedirect';

import DesktopAuthGate from './DesktopAuthGate';
import { finishOnboardingAndNavigate, repairDesktopOnboardingMarkers } from './finishOnboarding';
import { useOnboardingUserStateReady } from './useOnboardingUserStateReady';
import { resolveOnboardingWorkspace } from './workspaceResolution';

const INVITE_ROLE_MAP: Record<InviteRoleValue, 'admin' | 'member' | 'viewer'> = {
  admin: 'admin',
  guest: 'viewer',
  member: 'member',
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected profile photo could not be read.'));
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The selected profile photo could not be read.'));
    };
    reader.readAsDataURL(file);
  });

const persistOnboardingSetup = async (
  values: OnboardingFormValues,
  workspace: { id: string; slug: string },
  updateOnboarding: (input: Partial<{ setup: UserOnboardingSetup }>) => Promise<void>,
) => {
  await updateOnboarding({
    setup: {
      ...useUserStore.getState().onboarding?.setup,
      discoveryOther: values.discoveryOther.trim() || undefined,
      discoverySource: values.discoverySource,
      goals: values.goals,
      jobTitle: values.jobTitle.trim() || undefined,
      role: values.role,
      teamSize: values.teamSize,
      workspaceId: workspace.id,
      workspaceName: values.workspaceName.trim(),
      workspaceSlug: workspace.slug,
    },
  });
};

const OnboardingPage = memo(() => {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const finishOnboarding = useUserStore((s) => s.finishOnboarding);
  const updateAvatar = useUserStore((s) => s.updateAvatar);
  const updateFullName = useUserStore((s) => s.updateFullName);
  const updateGeneralConfig = useUserStore((s) => s.updateGeneralConfig);
  const updateOnboarding = useUserStore((s) => s.updateOnboarding);
  const initialFullName = useUserStore((s) => s.user?.fullName ?? '');
  const initialTelemetry = useUserStore(userGeneralSettingsSelectors.telemetry) ?? true;
  const initialTimezone = useUserStore(userGeneralSettingsSelectors.currentTimezone) ?? '';
  const initialWorkspaceName = useUserStore((s) => s.onboarding?.setup?.workspaceName);
  const initialWorkspaceSlug = useUserStore((s) => s.onboarding?.setup?.workspaceSlug);
  const userStateReady = useOnboardingUserStateReady();
  const userStateError = useUserStore((s) => s.isUserStateInitError);
  const refreshUserState = useUserStore((s) => s.refreshUserState);
  const createdWorkspaceRef = useRef<{ id: string; slug: string } | null>(null);
  const [openError, setOpenError] = useState<unknown>();
  // Server-authoritative completion: `finishedAt` on the user record, shared by
  // every client. A finished user landing here (stale bookmark, desktop boot
  // racing the marker repair) skips straight to the post-onboarding target.
  const onboardingFinished = useUserStore((s) => !!s.onboarding?.finishedAt);

  useEffect(() => {
    stashOnboardingCallbackUrl(search);
    clearStaleOnboardingCallbackUrl(pathname, search);
  }, [pathname, search]);

  useEffect(() => {
    if (!onboardingFinished) return;
    // The server record is authoritative, but the desktop boot path still
    // reads local markers — repair them here too or `BrowserManager` keeps
    // booting `/onboarding` on every launch. Fire-and-forget: a failed repair
    // just means one more detour through this redirect.
    void repairDesktopOnboardingMarkers();
    navigate(resolvePostOnboardingTargetUrl(), { replace: true });
  }, [navigate, onboardingFinished]);

  const handleComplete = async (values: OnboardingFormValues) => {
    const setup = useUserStore.getState().onboarding?.setup;
    const firstAgentId =
      setup?.firstAgentId ??
      homeAgentListSelectors
        .allAgents(useHomeStore.getState())
        .find(
          (agent) =>
            !!agent.heterogeneousType &&
            (!isBuiltinEngineType(agent.heterogeneousType) ||
              isBuiltinAgentUsable(useProviderBindingStore.getState().bindings)),
        )?.id;
    if (!firstAgentId) throw new Error('FIRST_AGENT_REQUIRED');
    const config = await agentService.getAgentConfigById(firstAgentId);
    const firstAgentDeviceId = config?.agencyConfig?.boundDeviceId ?? setup?.firstAgentDeviceId;
    const firstAgentExecutionTarget =
      isDesktop &&
      ((config?.agencyConfig?.executionTarget === 'local' &&
        !isBuiltinEngineType(config.agencyConfig.heterogeneousProvider?.type)) ||
        (!config && setup?.firstAgentExecutionTarget === 'local'))
        ? 'local'
        : 'device';
    if (firstAgentExecutionTarget === 'device') {
      if (!firstAgentDeviceId) throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
      await verifyFirstAgentDevice(firstAgentDeviceId);
    }
    await updateOnboarding({
      setup: { ...setup, firstAgentId, firstAgentDeviceId, firstAgentExecutionTarget },
    });
    await updateFullName(values.fullName.trim());
    await updateGeneralConfig({
      telemetry: values.telemetryEnabled,
      ...(values.timezone ? { timezone: values.timezone } : {}),
    });

    if (values.avatarFile) {
      await updateAvatar(await fileToDataUrl(values.avatarFile));
    }

    const workspace = await resolveOnboardingWorkspace(
      values,
      useUserStore.getState().onboarding?.setup?.workspaceId,
      createdWorkspaceRef,
      // Persist the candidate workspace id before the create call — a lost
      // response then resumes by identity on the next attempt instead of
      // matching by slug.
      async (candidate) => {
        await persistOnboardingSetup(values, candidate, updateOnboarding);
      },
    );
    createdWorkspaceRef.current = { id: workspace.id, slug: workspace.slug };

    // Checkpoint the resolved workspace into the server-side onboarding record
    // BEFORE invites: a reload or crash after this write resumes the same
    // workspace instead of minting a second one.
    await persistOnboardingSetup(values, workspace, updateOnboarding);

    await ensureFirstAgentInWorkspace(firstAgentId, workspace.id, {
      executionTarget: firstAgentExecutionTarget,
      ...(firstAgentDeviceId ? { boundDeviceId: firstAgentDeviceId } : {}),
    });

    const invitesByRole = new Map<'admin' | 'member' | 'viewer', string[]>();
    for (const invite of values.invites) {
      const email = invite.email.trim();
      if (!email) continue;
      const role = INVITE_ROLE_MAP[invite.role];
      invitesByRole.set(role, [...(invitesByRole.get(role) ?? []), email]);
    }

    const workspaceClient = createWorkspaceLambdaClient(workspace.id);
    for (const [role, emails] of invitesByRole) {
      const result = await workspaceClient.workspaceMember.invite.mutate({ emails, role });
      const failed = result.results.filter((item) => !item.ok && item.error !== 'already-invited');
      if (failed.length > 0) {
        throw new Error(ONBOARDING_INVITES_FAILED);
      }
    }

    await persistOnboardingSetup(values, workspace, updateOnboarding);

    return { workspaceId: workspace.id, workspaceSlug: workspace.slug };
  };

  const handleOpen = async () => {
    setOpenError(undefined);
    try {
      await finishOnboardingAndNavigate(
        finishOnboarding,
        navigate,
        async () => {
          const setup = useUserStore.getState().onboarding?.setup;
          if (!setup?.firstAgentId || !setup.workspaceId) throw new Error('FIRST_AGENT_REQUIRED');
          await ensureFirstAgentInWorkspace(setup.firstAgentId, setup.workspaceId, {
            executionTarget: setup.firstAgentExecutionTarget ?? 'device',
            ...(setup.firstAgentDeviceId ? { boundDeviceId: setup.firstAgentDeviceId } : {}),
          });
        },
        useUserStore.getState().onboarding?.setup?.firstAgentId,
      );
    } catch (error) {
      setOpenError(error);
    }
  };

  if (!userStateReady) {
    // Keep the wizard's chrome on screen while the user record loads — a bare
    // centered spinner reads as a blank white page on mobile.
    return (
      <div className="flex min-h-screen flex-col">
        <OnboardingHeader
          canGoBack={false}
          currentStep={0}
          statusLabel={''}
          totalSteps={0}
          onBack={() => {}}
        />
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-6" />
        </div>
      </div>
    );
  }

  if (userStateError) {
    return (
      <DesktopAuthGate>
        <AsyncError error={userStateError} onRetry={() => void refreshUserState()} />
      </DesktopAuthGate>
    );
  }

  return (
    <DesktopAuthGate>
      <AgentOnboarding>
        {openError !== undefined && (
          <AsyncError error={openError} onRetry={() => void handleOpen()} />
        )}
        <Onboarding
          initialFullName={initialFullName}
          initialTelemetry={initialTelemetry}
          initialTimezone={initialTimezone}
          initialWorkspaceName={initialWorkspaceName}
          initialWorkspaceSlug={initialWorkspaceSlug}
          onComplete={handleComplete}
          onOpen={handleOpen}
        />
      </AgentOnboarding>
    </DesktopAuthGate>
  );
});

OnboardingPage.displayName = 'OnboardingPage';

export default OnboardingPage;
