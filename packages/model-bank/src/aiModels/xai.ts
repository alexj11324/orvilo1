import type { AIChatModelCard } from '../types/aiModel';

// https://docs.x.ai/docs/models
const xaiChatModels: AIChatModelCard[] = [
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      vision: true,
      structuredOutput: true,
    },
    contextWindowTokens: 500_000,
    description:
      'Grok 4.6 is a frontier model for coding, long-running agents, and knowledge work with a 500K context window.',
    displayName: 'Grok 4.6',
    enabled: true,
    id: 'grok-4.6',
    /** @see https://docs.x.ai/developers/models/grok-4.6 */
    pricing: {
      units: [
        {
          name: 'textInput_cacheRead',
          unit: 'millionTokens',
          strategy: 'tiered',
          tiers: [
            { rate: 0.5, upTo: 199_999 },
            { rate: 1, upTo: 'infinity' },
          ],
        },
        {
          name: 'textInput',
          unit: 'millionTokens',
          strategy: 'tiered',
          tiers: [
            { rate: 2, upTo: 199_999 },
            { rate: 4, upTo: 'infinity' },
          ],
        },
        {
          name: 'textOutput',
          unit: 'millionTokens',
          strategy: 'tiered',
          tiers: [
            { rate: 6, upTo: 199_999 },
            { rate: 12, upTo: 'infinity' },
          ],
        },
      ],
    },
    releasedAt: '2026-08-12',
    settings: {
      extendParams: ['grok4_6ReasoningEffort'],
      searchImpl: 'params',
    },
    type: 'chat',
    family: 'grok',
    generation: 'grok-4.6',
    knowledgeCutoff: '2026-02',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      structuredOutput: true,
      vision: true,
    },
    contextWindowTokens: 500_000,
    description:
      "SpaceXAI's flagship model for agentic tasks and knowledge work — remarkably fast, with coding ability on par with Claude Opus.",
    displayName: 'Grok 4.5',
    enabled: true,
    family: 'grok',
    generation: 'grok-4.5',
    id: 'grok-4.5',
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 6, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    releasedAt: '2026-07-08',
    settings: {
      extendParams: ['grok4_5ReasoningEffort'],
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      search: true,
      structuredOutput: true,
      vision: true,
    },
    contextWindowTokens: 1_000_000,
    description: 'The most truth-seeking large language model in the world',
    displayName: 'Grok 4.3',
    enabled: true,
    family: 'grok',
    generation: 'grok-4.3',
    id: 'grok-4.3',
    knowledgeCutoff: '2025-12',
    pricing: {
      units: [
        {
          name: 'textInput_cacheRead',
          strategy: 'tiered',
          tiers: [
            { rate: 0.2, upTo: 200_000 },
            { rate: 0.4, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
        {
          name: 'textInput',
          strategy: 'tiered',
          tiers: [
            { rate: 1.25, upTo: 200_000 },
            { rate: 2.5, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
        {
          name: 'textOutput',
          strategy: 'tiered',
          tiers: [
            { rate: 2.5, upTo: 200_000 },
            { rate: 5, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
      ],
    },
    releasedAt: '2026-05-01',
    settings: {
      extendParams: ['grok4_3ReasoningEffort'],
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      search: true,
      structuredOutput: true,
      vision: true,
    },
    contextWindowTokens: 1_000_000,
    description: 'A non-reasoning variant for simple use cases',
    displayName: 'Grok 4.20 (Non-Reasoning)',
    enabled: true,
    family: 'grok',
    generation: 'grok-4.20',
    id: 'grok-4.20-0309-non-reasoning',
    pricing: {
      units: [
        {
          name: 'textInput_cacheRead',
          strategy: 'tiered',
          tiers: [
            { rate: 0.2, upTo: 200_000 },
            { rate: 0.4, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
        {
          name: 'textInput',
          strategy: 'tiered',
          tiers: [
            { rate: 1.25, upTo: 200_000 },
            { rate: 2.5, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
        {
          name: 'textOutput',
          strategy: 'tiered',
          tiers: [
            { rate: 2.5, upTo: 200_000 },
            { rate: 5, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
      ],
    },
    releasedAt: '2026-03-09',
    settings: {
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      structuredOutput: true,
      vision: true,
    },
    contextWindowTokens: 1_000_000,
    description: 'Intelligent, blazing-fast model that reasons before responding',
    displayName: 'Grok 4.20',
    enabled: true,
    family: 'grok',
    generation: 'grok-4.20',
    id: 'grok-4.20-0309-reasoning',
    pricing: {
      units: [
        {
          name: 'textInput_cacheRead',
          strategy: 'tiered',
          tiers: [
            { rate: 0.2, upTo: 200_000 },
            { rate: 0.4, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
        {
          name: 'textInput',
          strategy: 'tiered',
          tiers: [
            { rate: 1.25, upTo: 200_000 },
            { rate: 2.5, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
        {
          name: 'textOutput',
          strategy: 'tiered',
          tiers: [
            { rate: 2.5, upTo: 200_000 },
            { rate: 5, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
      ],
    },
    releasedAt: '2026-03-09',
    settings: {
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      reasoning: true,
      search: true,
      structuredOutput: true,
      vision: true,
    },
    contextWindowTokens: 2_000_000,
    description:
      'A team of 4 or 16 agents, Excels at research use cases, Does not currently support client-side tools. Only supports xAI server side tools (eg X Search, Web Search tools) and remote MCP tools.',
    displayName: 'Grok 4.20 Multi-Agent',
    enabled: true,
    family: 'grok',
    generation: 'grok-4.20',
    id: 'grok-4.20-multi-agent-0309',
    pricing: {
      units: [
        {
          name: 'textInput_cacheRead',
          strategy: 'tiered',
          tiers: [
            { rate: 0.2, upTo: 200_000 },
            { rate: 0.4, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
        {
          name: 'textInput',
          strategy: 'tiered',
          tiers: [
            { rate: 1.25, upTo: 200_000 },
            { rate: 2.5, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
        {
          name: 'textOutput',
          strategy: 'tiered',
          tiers: [
            { rate: 2.5, upTo: 200_000 },
            { rate: 5, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
      ],
    },
    releasedAt: '2026-03-09',
    settings: {
      extendParams: ['grok4_20ReasoningEffort'],
      searchImpl: 'params',
    },
    type: 'chat',
  },
];

export const allModels = [...xaiChatModels];

export default allModels;
