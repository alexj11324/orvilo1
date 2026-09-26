import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { LinearImportModel } from '@/database/models/linearImport';
import { linearInstallations } from '@/database/schemas/linearSync';
import { getServerDB } from '@/database/server';
import { createLinearGraphqlIssueProvider } from '@/server/services/linearSync/provider';
import { LinearImportWorkflow } from '@/server/workflows/linearImport';

const payloadSchema = z.object({ workspaceId: z.string().min(1), jobId: z.string().uuid() });

const publicFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('already imported into another project')) return message;
  if (message.includes('unmapped state')) return message;
  if (message.includes('invalid pagination cursor'))
    return 'Linear returned invalid pagination data';
  if (message.includes('installation is unavailable')) return 'Linear installation is unavailable';
  if (message.includes('public Linear team')) return message;
  return 'Linear import failed; retry after checking the connection';
};

/** One remote page per dispatch. The cursor advances only after all its issues commit. */
export const processLinearImportWorkflow = async (context: { requestPayload: unknown }) => {
  const { workspaceId, jobId } = payloadSchema.parse(context.requestPayload);
  const db = await getServerDB();
  const model = new LinearImportModel(db, workspaceId);
  const claimed = await model.claim(jobId);
  if (!claimed) return { claimed: false };
  const { job, owner } = claimed;
  let issueFailed = false;
  try {
    const [installation] = await db
      .select({
        organizationId: linearInstallations.organizationId,
        organizationName: linearInstallations.organizationName,
        status: linearInstallations.status,
      })
      .from(linearInstallations)
      .where(
        and(
          eq(linearInstallations.id, job.installationId),
          eq(linearInstallations.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!installation || installation.status !== 'active')
      throw new Error('Linear installation is unavailable');
    const provider = createLinearGraphqlIssueProvider({
      db,
      workspaceId,
      installationId: job.installationId,
      organizationId: installation.organizationId,
    });
    const team = (await provider.listTeams()).find((candidate) => candidate.id === job.teamId);
    if (
      !team ||
      team.organizationId !== installation.organizationId ||
      team.visibility !== 'public'
    ) {
      throw new Error('Selected source is no longer a public Linear team in this organization');
    }
    const page = await provider.listTeamIssues(job.teamId, 50, job.cursor);
    if (page.hasNextPage && (!page.endCursor || page.endCursor === job.cursor)) {
      throw new Error('Linear returned an invalid pagination cursor');
    }
    for (const issue of page.issues) {
      if (issue.teamId !== job.teamId)
        throw new Error('Linear returned an issue outside the selected team');
      const category = job.stateMappings.find(
        (mapping) => mapping.linearStateId === issue.stateId,
      )?.workflowCategory;
      if (!category) throw new Error(`Linear issue ${issue.identifier} has an unmapped state`);
      try {
        await model.recordIssue({
          jobId,
          owner,
          installationId: job.installationId,
          projectId: job.projectId,
          organizationId: installation.organizationId,
          organizationName: installation.organizationName,
          issue,
          workflowCategory: category,
        });
      } catch (error) {
        issueFailed = true;
        throw error;
      }
    }
    const updated = await model.completePage({
      id: jobId,
      owner,
      nextCursor: page.endCursor,
      hasNextPage: page.hasNextPage,
    });
    if (page.hasNextPage) {
      try {
        await LinearImportWorkflow.trigger({ workspaceId, jobId });
      } catch (error) {
        await model.failQueued(
          jobId,
          'Linear import continuation could not be scheduled; retry the job',
        );
        throw error;
      }
    }
    return { claimed: true, status: updated.status, pagesProcessed: updated.pagesProcessed };
  } catch (error) {
    await model.fail(jobId, owner, publicFailure(error), issueFailed);
    throw error;
  }
};
