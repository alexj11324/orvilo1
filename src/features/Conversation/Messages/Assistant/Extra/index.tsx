import { LOADING_FLAT } from '@orvilo/const';
import { isRemoteHeterogeneousType } from '@orvilo/heterogeneous-agents';
import { type ModelPerformance, type ModelUsage } from '@orvilo/types';
import { memo } from 'react';

import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import Usage from '../../components/Extras/Usage';

interface AssistantMessageExtraProps {
  content: string;
  model?: string;
  performance?: ModelPerformance;
  provider?: string;
  tools?: any[];
  usage?: ModelUsage;
}

export const AssistantMessageExtra = memo<AssistantMessageExtraProps>(
  ({ content, performance, usage, tools, provider, model }) => {
    const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);

    // Local CLI hetero agents (claude-code, codex) only report `model` after
    // turn_metadata lands mid-stream, so gating on `!!model` alone would skip
    // showing Usage at all. Remote hetero (openclaw, hermes) never expose a
    // real model id and rely on the brand label fallback in Usage — only those
    // should bypass the model check, otherwise local agents render a lone
    // empty-model ModelIcon while streaming.
    const showUsage =
      isDevMode &&
      content !== LOADING_FLAT &&
      (!!model || (!!provider && isRemoteHeterogeneousType(provider)));

    if (!showUsage) return null;

    return (
      <div className="flex flex-col gap-2" style={{ marginTop: !!tools?.length ? 8 : 4 }}>
        <Usage model={model!} performance={performance} provider={provider!} usage={usage} />
      </div>
    );
  },
);
