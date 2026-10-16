import { DEFAULT_SYSTEM_AGENT_CONFIG } from '@/const/settings';
import { type UserServiceModelConfig } from '@/types/user/settings';

const protectedKeys = Object.keys(DEFAULT_SYSTEM_AGENT_CONFIG);

const memoryServiceModelKeys = new Set([
  'memoryAnalysisAgentConfig',
  'userMemoryEmbedding',
  'userMemoryPersonaWriter',
]);
// Deployments configured before the Goal -> Orchestration workflow rename still
// set `goal=provider/model`. Dropping it silently would fall back to another
// model, so the old key is a deprecated alias for the renamed one.
const legacyKeyAliases: Record<string, string> = { goal: 'orchestrationWorkflow' };
const defaultModelAssignmentKeys = protectedKeys.filter((key) => !memoryServiceModelKeys.has(key));

export const parseSystemAgent = (envString: string = ''): Partial<UserServiceModelConfig> => {
  if (!envString) return {};

  const config: Partial<UserServiceModelConfig> = {};

  // Handle full-width commas and extra spaces
  const envValue = envString.replaceAll('，', ',').trim();

  const pairs = envValue.split(',');

  // Store default settings if there is a default=provider/model case
  let defaultSetting: { model: string; provider: string } | undefined;

  const legacyAssignments: Record<string, { model: string; provider: string }> = {};

  for (const pair of pairs) {
    const [key, value] = pair.split('=').map((s) => s.trim());

    if (key && value) {
      const [provider, ...modelParts] = value.split('/');
      const model = modelParts.join('/');

      if (!provider || !model) {
        throw new Error('Missing model or provider value');
      }

      // If it's the default key, save the default settings
      if (key === 'default') {
        defaultSetting = {
          model: model.trim(),
          provider: provider.trim(),
        };
        continue;
      }

      const legacyTarget = legacyKeyAliases[key];
      if (legacyTarget) {
        console.warn(
          `[SYSTEM_AGENT] "${key}" is deprecated, use "${legacyTarget}" instead. Applying it as "${legacyTarget}".`,
        );
        legacyAssignments[legacyTarget] = { model: model.trim(), provider: provider.trim() };
        continue;
      }

      if (protectedKeys.includes(key)) {
        config[key as keyof UserServiceModelConfig] = {
          model: model.trim(),
          provider: provider.trim(),
        } as any;
      }
    } else {
      throw new Error('Invalid environment variable format');
    }
  }

  // The renamed key wins when both spellings are present.
  for (const [key, value] of Object.entries(legacyAssignments)) {
    if (!config[key as keyof UserServiceModelConfig]) {
      config[key as keyof UserServiceModelConfig] = value as any;
    }
  }

  // If there are default settings, apply them to all unconfigured system agents
  if (defaultSetting) {
    for (const key of defaultModelAssignmentKeys) {
      if (!config[key as keyof UserServiceModelConfig]) {
        config[key as keyof UserServiceModelConfig] = {
          model: defaultSetting.model,
          provider: defaultSetting.provider,
        } as any;
      }
    }
  }

  return config;
};
