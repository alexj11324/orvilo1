import { z } from 'zod';

import { getServerDB } from '@/database/server';

import { createSlackIntegrationService } from '.';
import { getSlackChannelsRuntime } from './channelsRuntime';
import { createSlackChannelsStore } from './store';

export const slackEventInput = z.object({
  body: z.record(z.string(), z.unknown()),
  conversationKey: z.string().min(1),
  installationId: z.string().uuid(),
  teamId: z.string().min(1),
  tokenRevision: z.string().uuid(),
});

export const runSlackIntegrationEvent = async (input: z.infer<typeof slackEventInput>) => {
  const database = await getServerDB();
  const service = createSlackIntegrationService(database);
  const installation = await service.getInstallationByTeamId(input.teamId);
  // Queued deliveries cannot survive disconnect or borrow a replacement grant.
  if (
    !installation ||
    installation.id !== input.installationId ||
    installation.tokenRevision !== input.tokenRevision
  )
    return { skipped: true };
  const runtime = await getSlackChannelsRuntime(
    {
      botToken: await service.getBotToken(installation),
      id: installation.id,
      teamId: installation.slackTeamId,
      tokenRevision: installation.tokenRevision,
    },
    {
      database,
      resolveBinding: (identity) => service.resolveSlackBinding(identity),
      resolveUser: async (identity) => {
        const user = await service.resolveSlackUser(identity);
        return user ? { id: user.userId } : null;
      },
      store: createSlackChannelsStore(installation.id),
    },
  );
  await runtime.dispatch(input.body);
  return { success: true };
};
