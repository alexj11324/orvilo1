import { randomBytes, randomUUID } from 'node:crypto';

import type { DecryptedConnector } from '@/database/models/connector';
import { ConnectorStatus } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { isGitHubMcpConnector } from '@/server/services/connector/githubMcp';
import { getValidGitHubAccessGrant } from '@/server/services/githubOAuth';
import { verifyGithubRepository } from '@/server/services/githubRepo';

import type { McpEventBinding } from './deliveryTypes';
import type { SqlMcpEventBindingRepository } from './inbox';
import type { McpEventDefinition } from './protocol';

export const GITHUB_AUTOMATION_EVENTS = [
  'pull_request',
  'workflow_run',
  'check_run',
  'check_suite',
] as const;

/** Native GitHub events use GitHub webhooks, not experimental MCP subscriptions. */
export const githubEventDefinitions: McpEventDefinition[] = GITHUB_AUTOMATION_EVENTS.map(
  (name) => ({
    delivery: ['webhook'],
    inputSchema: {
      type: 'object',
      properties: { repository: { type: 'string', minLength: 1, maxLength: 500 } },
      required: ['repository'],
      additionalProperties: false,
    },
    name: `github.${name}`,
    payloadSchema: { type: 'object' },
  }),
);

export async function createGithubEventBinding(input: {
  arguments: Record<string, unknown>;
  callbackUrl: (token: string) => string;
  connector: Pick<DecryptedConnector, 'id' | 'agentId' | 'isEnabled' | 'status' | 'metadata'>;
  db: OrviloDatabase;
  eventName: string;
  repository: SqlMcpEventBindingRepository;
  tenantId: string;
}) {
  const { connector } = input;
  if (
    !isGitHubMcpConnector(connector) ||
    connector.agentId ||
    !connector.isEnabled ||
    connector.status !== ConnectorStatus.connected ||
    !connector.metadata?.githubMcp?.grantOwnerUserId
  )
    throw new Error('GitHub connection unavailable');
  if (!githubEventDefinitions.some((event) => event.name === input.eventName))
    throw new Error('GitHub event unavailable');
  if (
    typeof input.arguments.repository !== 'string' ||
    Object.keys(input.arguments).some((key) => key !== 'repository')
  )
    throw new Error('GitHub repository required');
  const grant = await getValidGitHubAccessGrant({
    db: input.db,
    userId: connector.metadata.githubMcp.grantOwnerUserId,
  });
  if (!grant) throw new Error('GitHub authorization required');
  const verified = await verifyGithubRepository(input.arguments.repository, grant.accessToken);
  if (!verified) throw new Error('GitHub repository unavailable');
  const callbackToken = randomUUID();
  const callbackUrl = input.callbackUrl(callbackToken);
  const url = new URL(callbackUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search)
    throw new Error('GitHub callback requires HTTPS');
  const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
  const binding: McpEventBinding = {
    callbackToken,
    callbackUrl,
    connectorId: connector.id,
    cursor: null,
    eventArguments: { repository: input.arguments.repository },
    eventName: input.eventName,
    expiresAt: null,
    github: {
      repositoryId: verified.remoteRepositoryId,
      repositoryFullName: `${verified.coordinate.owner}/${verified.coordinate.name}`,
      githubUserId: grant.githubUserId,
      grantRevision: grant.grantRevision,
      encryptedSecret: await gateKeeper.encrypt(randomBytes(32).toString('hex')),
    },
    id: randomUUID(),
    payloadSchema: { type: 'object' },
    remoteSubscriptionId: null,
    revision: 0,
    schemaId: `github:${verified.remoteRepositoryId}:${input.eventName}`,
    signingKeys: [],
    sourceType: 'github',
    state: 'pending',
    tenantId: input.tenantId,
    truncated: false,
  };
  await input.repository.createPending(binding);
  return binding;
}
