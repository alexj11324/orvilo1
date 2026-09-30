import { SlidersHorizontal, Sparkles } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAgentStore } from '@/store/agent';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';

import { useAgentId } from '../../hooks/useAgentId';
import { useUpdateAgentConfig } from '../../hooks/useUpdateAgentConfig';
import { SimpleTooltip } from '../../SimpleTooltip';

const SkillActivateMode = memo(() => {
  const { t } = useTranslation('setting');
  const agentId = useAgentId();
  const { updateAgentChatConfig } = useUpdateAgentConfig();
  const currentMode = useAgentStore((s) =>
    chatConfigByIdSelectors.getSkillActivateModeById(agentId)(s),
  );

  return (
    <Tabs
      value={currentMode}
      onValueChange={async (key) => {
        await updateAgentChatConfig({ skillActivateMode: key as 'auto' | 'manual' });
      }}
    >
      <TabsList>
        <TabsTrigger value="auto">
          <SimpleTooltip title={t('tools.skillActivateMode.auto.desc')}>
            <span className="anticon" role="img">
              <Sparkles fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
          </SimpleTooltip>
        </TabsTrigger>
        <TabsTrigger value="manual">
          <SimpleTooltip title={t('tools.skillActivateMode.manual.desc')}>
            <span className="anticon" role="img">
              <SlidersHorizontal fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
          </SimpleTooltip>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
});

export default SkillActivateMode;
