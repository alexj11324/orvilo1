/**
 * Empty ResourceLoader — workspace content inside the isolated tree is
 * untrusted, so extension/skill/prompt/theme/AGENTS.md discovery must be off
 * entirely rather than merely filtered. Nothing loads, nothing scans.
 */

import {
  createExtensionRuntime,
  type LoadExtensionsResult,
  type ResourceLoader,
} from '@earendil-works/pi-coding-agent';

const EMPTY: { skills: []; prompts: []; themes: []; diagnostics: [] } = {
  skills: [],
  prompts: [],
  themes: [],
  diagnostics: [],
};

export class EmptyResourceLoader implements ResourceLoader {
  getExtensions(): LoadExtensionsResult {
    // AgentSession still wires an ExtensionRunner for lifecycle events, so the
    // result must carry a live runtime even though no extension ever loads.
    return {
      diagnostics: [],
      errors: [],
      extensions: [],
      runtime: createExtensionRuntime(),
    };
  }

  getSkills(): { skills: unknown[]; diagnostics: unknown[] } {
    return { skills: EMPTY.skills, diagnostics: EMPTY.diagnostics };
  }

  getPrompts(): { prompts: unknown[]; diagnostics: unknown[] } {
    return { prompts: EMPTY.prompts, diagnostics: EMPTY.diagnostics };
  }

  getThemes(): { themes: unknown[]; diagnostics: unknown[] } {
    return { themes: EMPTY.themes, diagnostics: EMPTY.diagnostics };
  }

  getAgentsFiles(): { agentsFiles: Array<{ path: string; content: string }> } {
    return { agentsFiles: [] };
  }

  getSystemPrompt(): string | undefined {
    return undefined;
  }

  getAppendSystemPrompt(): string[] {
    return [];
  }

  extendResources(_paths: unknown): void {}

  reload(): Promise<void> {
    return Promise.resolve();
  }
}
