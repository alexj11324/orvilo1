'use client';

import { PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePermission } from '@/hooks/usePermission';

import { createCreateNewProviderModal } from '../features/CreateNewProvider';

const AddNewProvider = () => {
  const { t } = useTranslation('modelProvider');
  const { allowed: canManageProvider, reason } = usePermission('manage_provider_key');
  const label = t('menu.addCustomProvider');

  // A disabled button swallows pointer events, so the tooltip trigger is a
  // wrapper span that keeps the permission reason hoverable.
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex flex-none" />}>
        <Button
          aria-label={label}
          disabled={!canManageProvider}
          size="icon"
          variant="outline"
          onClick={() => {
            if (!canManageProvider) return;
            createCreateNewProviderModal();
          }}
        >
          <PlusIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{canManageProvider ? label : reason}</TooltipContent>
    </Tooltip>
  );
};

export default AddNewProvider;
