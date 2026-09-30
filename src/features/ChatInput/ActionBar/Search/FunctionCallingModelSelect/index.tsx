import { createStaticStyles } from 'antd-style';
import { memo, useMemo } from 'react';

import { ModelItemRender, ProviderItemRender } from '@/components/ModelSelect';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEnabledChatModels } from '@/hooks/useEnabledChatModels';
import { type WorkingModel } from '@/types/agent';
import { type EnabledProviderWithModels } from '@/types/aiProvider';

const prefixCls = 'ant';

const styles = createStaticStyles(({ css }) => ({
  select: css`
    &.${prefixCls}-select-dropdown .${prefixCls}-select-item-option-grouped {
      padding-inline-start: 12px;
    }
  `,
}));

interface ModelSelectProps {
  disabled?: boolean;
  onChange?: (props: WorkingModel) => void;
  showAbility?: boolean;
  value?: WorkingModel;
}

const ModelSelect = memo<ModelSelectProps>(({ value, onChange, ...rest }) => {
  const enabledList = useEnabledChatModels();

  const options = useMemo(() => {
    const getChatModels = (provider: EnabledProviderWithModels) =>
      provider.children
        .filter((model) => !!model.abilities.functionCall)
        .map((model) => ({
          label: <ModelItemRender {...model} {...model.abilities} showInfoTag={false} />,
          provider: provider.id,
          value: `${provider.id}/${model.id}`,
        }));

    if (enabledList.length === 1) {
      const provider = enabledList[0];

      return getChatModels(provider);
    }

    return enabledList
      .filter((p) => !!getChatModels(p).length)
      .map((provider) => {
        const options = getChatModels(provider);

        return {
          key: provider.id,
          label: (
            <ProviderItemRender
              logo={provider.logo}
              name={provider.name}
              provider={provider.id}
              source={provider.source}
            />
          ),
          options,
        };
      });
  }, [enabledList]);

  return (
    <TooltipProvider>
      <Select
        disabled={rest.disabled}
        value={`${value?.provider}/${value?.model}`}
        onValueChange={(v) => {
          const model = v.split('/').slice(1).join('/');
          const provider = v.split('/')[0];
          onChange?.({ model, provider });
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={styles.select}>
          {options.map((item) =>
            'options' in item ? (
              <div key={item.key}>
                <div className="px-1.5 py-1 text-xs text-muted-foreground">{item.label}</div>
                {item.options.map((option) => (
                  <SelectItem key={option.value} label={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </div>
            ) : (
              <SelectItem key={item.value} label={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
    </TooltipProvider>
  );
});

export default ModelSelect;
