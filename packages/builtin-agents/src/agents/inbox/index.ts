import { AgentDocumentsIdentifier } from '@orvilo/builtin-tool-agent-documents';
import { UserInteractionIdentifier } from '@orvilo/builtin-tool-user-interaction';
import { DEFAULT_ORVILO_ENGINE } from '@orvilo/types';

import type { BuiltinAgentDefinition } from '../../types';
import { BUILTIN_AGENT_SLUGS } from '../../types';
import { createSystemRole } from './systemRole';

/**
 * Inbox Agent - the default assistant agent for general conversations
 *
 * Note: model and provider are intentionally undefined to use user's default settings
 */
export const INBOX: BuiltinAgentDefinition = {
  avatar: '/avatars/orvilo-ai.png',
  // The inbox agent is bound to the builtin Orvilo harness at creation — an
  // agent that exists without a harness is a write bug, so the binding is part
  // of the persist payload rather than something the user repairs later.
  persist: {
    agencyConfig: {
      heterogeneousProvider: { engine: DEFAULT_ORVILO_ENGINE, type: 'orvilo' },
    },
  },
  runtime: (ctx) => ({
    plugins: [AgentDocumentsIdentifier, UserInteractionIdentifier, ...(ctx.plugins || [])],
    // A user-customized prompt wins; the runtime one is only the default.
    systemRole:
      ctx.storedSystemRole ||
      createSystemRole(ctx.userLocale, { name: ctx.agentName, title: ctx.agentTitle }),
  }),

  slug: BUILTIN_AGENT_SLUGS.inbox,
};
