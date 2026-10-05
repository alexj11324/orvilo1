import { canMountBuiltinToolSurface } from '@orvilo/heterogeneous-agents';
import { Blocks } from 'lucide-react';
import { memo, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { useModelSupportToolUse } from '@/hooks/useModelSupportToolUse';
import { useTopicAgencyConfig } from '@/hooks/useTopicAgencyConfig';

import { useAgentId } from '../../hooks/useAgentId';
import { useEffectiveModel } from '../../hooks/useEffectiveModel';
import { ChatInputAction } from '../components/ChatInputAction';
import PopoverContent from './PopoverContent';
import { useControls } from './useControls';

const Tools = memo(() => {
  const { t } = useTranslation('setting');
  const { marketItems, pinnedCount, autoCount, isPolicyMenuOpen } = useControls();

  const agentId = useAgentId();
  const { model, provider } = useEffectiveModel(agentId);

  const supportsModelTools = useModelSupportToolUse(model, provider);
  const { agencyConfig } = useTopicAgencyConfig(agentId);
  const enableFC = agencyConfig?.heterogeneousProvider
    ? canMountBuiltinToolSurface(agencyConfig.heterogeneousProvider)
    : supportsModelTools;

  if (!enableFC)
    return (
      <ChatInputAction disabled icon={Blocks} showTooltip={true} title={t('tools.disabled')} />
    );

  return (
    <Suspense fallback={<ChatInputAction disabled icon={Blocks} title={t('tools.title')} />}>
      <ChatInputAction
        aria-label={t('tools.title')}
        icon={Blocks}
        showTooltip={false}
        title={t('tools.title')}
        popover={{
          content: (
            <PopoverContent
              autoCount={autoCount}
              detailPopoverDisabled={isPolicyMenuOpen}
              items={marketItems}
              pinnedCount={pinnedCount}
            />
          ),
          maxWidth: 320,
          minWidth: 320,
          styles: {
            content: {
              padding: 0,
            },
          },
        }}
      />
    </Suspense>
  );
});

export default Tools;
