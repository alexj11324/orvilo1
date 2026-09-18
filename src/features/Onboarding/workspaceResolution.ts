import { createNanoId } from '@orvilo/utils';

import { type OnboardingFormValues } from '@/components/blocks/onboarding-2/components/onboarding';
import { lambdaClient } from '@/libs/trpc/client';

/**
 * Resolve the onboarding workspace without ever minting a duplicate: reuse the
 * in-memory ref for same-mount retries, then the server-side onboarding
 * checkpoint (survives reloads and account switches), then `create` under a
 * caller-chosen candidate id.
 *
 * The candidate id is the idempotency identity: `checkpointWorkspace` persists
 * it BEFORE the create call, so a lost response or a racing second tab commits
 * (or finds) exactly that row — and the error path adopts only the workspace
 * whose id is the id we minted. A foreign workspace that merely shares the slug
 * is never hijacked; a same-slug conflict with no id match rethrows.
 */
export const resolveOnboardingWorkspace = async (
  values: Pick<OnboardingFormValues, 'workspaceName' | 'workspaceSlug'>,
  persistedWorkspaceId: string | undefined,
  createdWorkspaceRef: { current: { id: string; slug: string } | null },
  checkpointWorkspace?: (candidate: { id: string; slug: string }) => Promise<void>,
): Promise<{ id: string; slug: string }> => {
  if (createdWorkspaceRef.current) return createdWorkspaceRef.current;

  const name = values.workspaceName.trim();
  const slug = values.workspaceSlug.trim();

  // A checkpointed id doubles as the candidate key: if the row exists the
  // flow already committed it; if it vanished, reusing the id keeps a retried
  // create idempotent without a second checkpoint write.
  const candidateId = persistedWorkspaceId ?? createNanoId(16)();

  if (persistedWorkspaceId) {
    const mine = (await lambdaClient.workspace.list.query()).find(
      (w) => w.id === persistedWorkspaceId,
    );
    if (mine) return { id: mine.id, slug: mine.slug };
    // Checkpointed workspace vanished (deleted between attempts) — create under
    // the same candidate id below.
  }

  // Persist the candidate id before the create call: a reload between this
  // write and a lost create response resumes with the same id, so the
  // recovery lookup below correlates by identity rather than by slug.
  await checkpointWorkspace?.({ id: candidateId, slug });

  try {
    const workspace = await lambdaClient.workspace.create.mutate({ id: candidateId, name, slug });
    return { id: workspace.id, slug: workspace.slug };
  } catch (error) {
    // The create may have committed while its response was lost, or a second
    // tab raced the same checkpointed id — either way the committed row, if
    // ours, is the one carrying OUR candidate id in the caller's own list.
    const mine = (await lambdaClient.workspace.list.query().catch(() => [])).find(
      (w) => w.id === candidateId,
    );
    if (mine) return { id: mine.id, slug: mine.slug };
    throw error;
  }
};
