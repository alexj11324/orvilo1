'use client';

import isEqual from 'fast-deep-equal';
import { SettingsIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePermission } from '@/hooks/usePermission';
import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';

import { createSettingModal } from './SettingModal';

const UpdateProviderInfo = memo(() => {
  const { t } = useTranslation('modelProvider');
  const { t: tCommon } = useTranslation('common');

  const providerConfig = useAiInfraStore(aiProviderSelectors.activeProviderConfig, isEqual);
  const { allowed: canManageProvider, reason } = usePermission('manage_provider_key');
  const label = canManageProvider ? t('updateAiProvider.tooltip') : reason;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Button
          aria-label={tCommon('settings')}
          disabled={!canManageProvider}
          size="icon"
          variant="ghost"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!canManageProvider || !providerConfig) return;
            createSettingModal({
              id: providerConfig.id,
              initialValues: providerConfig,
            });
          }}
        >
          <SettingsIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
});

export default UpdateProviderInfo;
