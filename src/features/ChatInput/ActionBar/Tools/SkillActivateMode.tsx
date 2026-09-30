import { Tabs } from '@lobehub/ui/base-ui';
import { SlidersHorizontal, Sparkles } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

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
      activeKey={currentMode}
      size="small"
      items={[
        {
          key: 'auto',
          label: (
            <SimpleTooltip title={t('tools.skillActivateMode.auto.desc')}>
              <span className="anticon" role="img">
                <Sparkles fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
              </span>
            </SimpleTooltip>
          ),
        },
        {
          key: 'manual',
          label: (
            <SimpleTooltip title={t('tools.skillActivateMode.manual.desc')}>
              <span className="anticon" role="img">
                <SlidersHorizontal fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
              </span>
            </SimpleTooltip>
          ),
        },
      ]}
      onChange={async (key) => {
        await updateAgentChatConfig({ skillActivateMode: key as 'auto' | 'manual' });
      }}
    />
  );
});

export default SkillActivateMode;
