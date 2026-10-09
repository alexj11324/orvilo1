import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import InstantSwitch from '@/components/InstantSwitch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePermission } from '@/hooks/usePermission';
import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';

interface SwitchProps {
  Component?: FC<{ id: string }>;
  id: string;
}

const Switch = ({ id, Component }: SwitchProps) => {
  const { t } = useTranslation('modelProvider');
  const [toggleProviderEnabled, enabled, isLoading] = useAiInfraStore((s) => [
    s.toggleProviderEnabled,
    aiProviderSelectors.isProviderEnabled(id)(s),
    aiProviderSelectors.isAiProviderConfigLoading(id)(s),
  ]);
  const { allowed: canManageProvider, reason } = usePermission('manage_provider_key');

  if (isLoading) return <Skeleton className="h-[18px] w-8 rounded-full" />;

  // slot for cloud
  if (Component) return <Component id={id} />;

  const switchNode = (
    <InstantSwitch
      aria-label={t('list.title.enabled')}
      disabled={!canManageProvider}
      enabled={enabled}
      onChange={async (enabled) => {
        if (!canManageProvider) return;
        await toggleProviderEnabled(id as any, enabled);
      }}
    />
  );

  if (canManageProvider) return switchNode;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{switchNode}</TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
};

export default Switch;
