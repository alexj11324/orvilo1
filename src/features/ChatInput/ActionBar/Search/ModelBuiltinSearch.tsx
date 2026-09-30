import { Exa, Google } from '@lobehub/icons';
import { Switch } from '@lobehub/ui/base-ui';
import { Search } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAgentStore } from '@/store/agent';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';
import { aiModelSelectors, useAiInfraStore } from '@/store/aiInfra';

import { useAgentId } from '../../hooks/useAgentId';
import { useEffectiveModel } from '../../hooks/useEffectiveModel';
import { useUpdateAgentConfig } from '../../hooks/useUpdateAgentConfig';

interface SearchEngineIconProps {
  icon?: string;
}

const SearchEngineIcon = ({ icon }: SearchEngineIconProps) => {
  switch (icon) {
    case 'google': {
      return <Google.Avatar size={20} />;
    }

    case 'exa': {
      return <Exa.Avatar size={20} />;
    }

    default: {
      return (
        <span className="anticon" role="img">
          <Search fill={'transparent'} height={14} size={14} width={14} />
        </span>
      );
    }
  }
};

interface ModelBuiltinSearchProps {
  disabled?: boolean;
}

const ModelBuiltinSearch = memo<ModelBuiltinSearchProps>(({ disabled }) => {
  const { t } = useTranslation('chat');
  const agentId = useAgentId();
  const { updateAgentChatConfig } = useUpdateAgentConfig();
  const { model, provider } = useEffectiveModel(agentId);
  const checked = useAgentStore((s) =>
    chatConfigByIdSelectors.getUseModelBuiltinSearchById(agentId)(s),
  );

  const [isLoading, setLoading] = useState(false);
  const modelCard = useAiInfraStore(aiModelSelectors.getEnabledModelById(model, provider));

  return (
    <div
      className="flex flex-row items-center justify-between"
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : undefined,
        userSelect: 'none',
        padding: '8px 12px',
      }}
      onClick={async () => {
        if (disabled) return;
        setLoading(true);
        await updateAgentChatConfig({ useModelBuiltinSearch: !checked });
        setLoading(false);
      }}
    >
      <div className="flex flex-row items-center gap-2">
        <SearchEngineIcon icon={modelCard?.settings?.searchProvider} />
        {t('search.mode.useModelBuiltin')}
      </div>
      <Switch checked={checked} disabled={disabled} loading={isLoading} size={'small'} />
    </div>
  );
});
export default ModelBuiltinSearch;
