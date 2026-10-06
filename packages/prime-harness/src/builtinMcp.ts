import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { HarnessPromptParams } from '@orvilo/agent-execution/controlPlane/harnessProtocol';

/** Use upstream's transient MCP surface; never persist an operation URL in settings. */
export const withPrimeBuiltinMcp = async (
  session: Pick<AgentSession, 'replaceAcpMcpServers' | 'releaseAcpMcpServers'>,
  mount: HarnessPromptParams['builtinMcp'],
  prompt: () => Promise<void>,
): Promise<void> => {
  if (!mount) return prompt();
  const url = new URL(mount.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
    throw new Error('Prime builtin MCP must use the device loopback endpoint');
  session.replaceAcpMcpServers(
    [{ headers: {}, name: 'orvilo_cc', type: 'http', url: mount.url }],
    mount.operationId,
  );
  try {
    await prompt();
  } finally {
    await session.releaseAcpMcpServers(mount.operationId, ['orvilo_cc']);
  }
};
