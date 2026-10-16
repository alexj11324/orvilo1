import type { AgentContentBlock, AgentImageBlock } from './types';

export interface HeterogeneousPromptEngineInput {
  imageList?: HeterogeneousPromptImage[];
  prompt: string;
  systemContext?: string;
}

export interface HeterogeneousPromptImage {
  id?: string;
  url: string;
}

export interface HeterogeneousPromptContextProvider {
  getContext: (input: HeterogeneousPromptEngineInput) => string | undefined;
  name: string;
}

const topicReferenceGuidanceProvider: HeterogeneousPromptContextProvider = {
  getContext: ({ prompt }) => {
    if (!prompt.includes('<refer_topic') && !prompt.includes('\\<refer\\_topic')) return;

    return [
      '## Referenced topics',
      'The user message contains one or more `<refer_topic>` tags. When you need the conversation from a referenced topic, retrieve it with `orvilo topic view <topic-id>` using the `id` from the tag.',
    ].join('\n');
  },
  name: 'TopicReferenceGuidanceProvider',
};

const defaultContextProviders = [topicReferenceGuidanceProvider];

const SKILL_CHIP = /<skill\s[^>]*?name="([^"]+)"[^>]*\/>/g;
const CLI_SKILL_NAME = /^[\w.:-]+$/;
// Agent-document skills are Orvilo's own; the CLI has no command for them.
const AGENT_DOCUMENT_SKILL_PREFIX = 'agent-skills:';

/**
 * The composer writes a picked skill as `<skill name="…" label="…" />`. An
 * external CLI reads that as plain text; it loads a skill from `/name`. Only
 * the text sent to the CLI changes; the stored message keeps the chip.
 */
export const rewriteSkillChipsForCli = (prompt: string): string =>
  prompt.replaceAll(SKILL_CHIP, (chip, name: string) =>
    CLI_SKILL_NAME.test(name) && !name.startsWith(AGENT_DOCUMENT_SKILL_PREFIX) ? `/${name}` : chip,
  );

/**
 * Builds the semantic prompt shared by every heterogeneous-agent transport.
 * Providers add Orvilo context before the user message; per-agent wire
 * serialization (ACP prompt blocks, exec stdin payloads) lives under
 * `./spawn` / `execStdinPayload`.
 */
export class HeterogeneousPromptEngine {
  constructor(
    private input: HeterogeneousPromptEngineInput,
    private contextProviders: HeterogeneousPromptContextProvider[] = defaultContextProviders,
  ) {}

  process(): AgentContentBlock[] {
    const blocks: AgentContentBlock[] = [];
    const { imageList = [], prompt, systemContext } = this.input;

    if (systemContext?.trim()) blocks.push({ text: systemContext.trim(), type: 'text' });

    for (const provider of this.contextProviders) {
      const context = provider.getContext(this.input)?.trim();
      if (context) blocks.push({ text: context, type: 'text' });
    }

    if (prompt) blocks.push({ text: rewriteSkillChipsForCli(prompt), type: 'text' });
    blocks.push(
      ...imageList.map(({ id, url }): AgentImageBlock => ({
        source: { id, type: 'url', url },
        type: 'image',
      })),
    );

    return blocks;
  }
}

export const buildHeterogeneousPrompt = (
  input: HeterogeneousPromptEngineInput,
): AgentContentBlock[] => new HeterogeneousPromptEngine(input).process();
