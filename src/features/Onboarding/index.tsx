'use client';

import '@/app/globals.css';

import { type UserOnboardingSetup } from '@orvilo/types';
import { memo, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { type InviteRoleValue } from '@/components/blocks/onboarding-2/components/data';
import {
  Onboarding,
  ONBOARDING_INVITES_FAILED,
  type OnboardingFormValues,
} from '@/components/blocks/onboarding-2/components/onboarding';
import { createWorkspaceLambdaClient, lambdaClient } from '@/libs/trpc/client';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
import {
  clearStaleOnboardingCallbackUrl,
  resolvePostOnboardingTargetUrl,
  stashOnboardingCallbackUrl,
} from '@/utils/onboardingRedirect';

import DesktopAuthGate from './DesktopAuthGate';
import { finishOnboardingAndNavigate } from './finishOnboarding';

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
  workspaceId: string,
  updateOnboarding: (input: Partial<{ setup: UserOnboardingSetup }>) => Promise<void>,
) => {
  await updateOnboarding({
    setup: {
      discoveryOther: values.discoveryOther.trim() || undefined,
      discoverySource: values.discoverySource,
      goals: values.goals,
      jobTitle: values.jobTitle.trim() || undefined,
      role: values.role,
      teamSize: values.teamSize,
      workspaceId,
      workspaceName: values.workspaceName.trim(),
      workspaceSlug: values.workspaceSlug.trim(),
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
  const createdWorkspaceRef = useRef<{ id: string; slug: string } | null>(null);
  // Server-authoritative completion: `finishedAt` on the user record, shared by
  // every client. A finished user landing here (stale bookmark, desktop boot
  // racing the marker repair) skips straight to the post-onboarding target.
  const onboardingFinished = useUserStore((s) => !!s.onboarding?.finishedAt);

  useEffect(() => {
    stashOnboardingCallbackUrl(search);
    clearStaleOnboardingCallbackUrl(pathname, search);
  }, [pathname, search]);

  useEffect(() => {
    if (onboardingFinished) navigate(resolvePostOnboardingTargetUrl(), { replace: true });
  }, [navigate, onboardingFinished]);

  const handleComplete = async (values: OnboardingFormValues) => {
    await updateFullName(values.fullName.trim());
    await updateGeneralConfig({ telemetry: values.telemetryEnabled });

    if (values.avatarFile) {
      await updateAvatar(await fileToDataUrl(values.avatarFile));
    }

    const workspace =
      createdWorkspaceRef.current ??
      (await lambdaClient.workspace.create.mutate({
        name: values.workspaceName.trim(),
        slug: values.workspaceSlug.trim(),
      }));
    createdWorkspaceRef.current = { id: workspace.id, slug: workspace.slug };

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

    await persistOnboardingSetup(values, workspace.id, updateOnboarding);

    return { workspaceId: workspace.id, workspaceSlug: workspace.slug };
  };

  const handleOpen = () => {
    void finishOnboardingAndNavigate(finishOnboarding, navigate);
  };

  return (
    <DesktopAuthGate>
      <Onboarding
        initialFullName={initialFullName}
        initialTelemetry={initialTelemetry}
        onComplete={handleComplete}
        onOpen={handleOpen}
      />
    </DesktopAuthGate>
  );
});

OnboardingPage.displayName = 'OnboardingPage';

export default OnboardingPage;
