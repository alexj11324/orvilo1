import { type OnboardingFormValues } from '@/components/blocks/onboarding-2/components/onboarding';
import { lambdaClient } from '@/libs/trpc/client';

/**
 * Resolve the onboarding workspace without ever minting a duplicate: reuse the
 * in-memory ref for same-mount retries, then the server-side onboarding
 * checkpoint (survives reloads and account switches), then `create`, and on a
 * lost-response/conflict adopt the row only when it appears in the caller's own
 * membership list — a foreign workspace that merely shares the slug is never
 * hijacked.
 */
export const resolveOnboardingWorkspace = async (
  values: Pick<OnboardingFormValues, 'workspaceName' | 'workspaceSlug'>,
  persistedWorkspaceId: string | undefined,
  createdWorkspaceRef: { current: { id: string; slug: string } | null },
): Promise<{ id: string; slug: string }> => {
  if (createdWorkspaceRef.current) return createdWorkspaceRef.current;

  if (persistedWorkspaceId) {
    const mine = (await lambdaClient.workspace.list.query()).find(
      (w) => w.id === persistedWorkspaceId,
    );
    if (mine) return { id: mine.id, slug: mine.slug };
    // Checkpointed workspace vanished (deleted between attempts) — create fresh.
  }

  const name = values.workspaceName.trim();
  const slug = values.workspaceSlug.trim();
  try {
    const workspace = await lambdaClient.workspace.create.mutate({ name, slug });
    return { id: workspace.id, slug: workspace.slug };
  } catch (error) {
    // The create may have committed while its response was lost, or a second
    // tab raced us to the same slug.
    const mine = (await lambdaClient.workspace.list.query().catch(() => [])).find(
      (w) => w.slug === slug,
    );
    if (mine) return { id: mine.id, slug: mine.slug };
    throw error;
  }
};
