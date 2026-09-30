'use client';

import { Trash2Icon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import ActionIcon from '@/components/ActionIcon';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DESKTOP_HEADER_ICON_SIZE, DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { useUserMemoryStore } from '@/store/userMemory';

export const MEMORY_DETAIL_QUERY_KEYS = [
  'activityId',
  'contextId',
  'experienceId',
  'identityId',
  'preferenceId',
] as const;

interface Props {
  iconOnly?: boolean;
}

const PurgeButton = memo<Props>(({ iconOnly }) => {
  const { t } = useTranslation(['common', 'memory']);
  const translate = t as (key: string, options?: Record<string, unknown>) => string;
  const purgeAllMemories = useUserMemoryStore((s) => s.purgeAllMemories);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const handleClick = () => {
    confirmModal({
      cancelText: translate('cancel', { ns: 'common' }),
      content: translate('purge.confirm', { ns: 'memory' }),
      okButtonProps: { danger: true },
      okText: translate('confirm', { ns: 'common' }),
      onOk: async () => {
        try {
          setLoading(true);
          await purgeAllMemories();
          const nextSearchParams = new URLSearchParams(searchParams);

          for (const key of MEMORY_DETAIL_QUERY_KEYS) {
            nextSearchParams.delete(key);
          }

          setSearchParams(nextSearchParams, { replace: true });
          toast.success(translate('purge.success', { ns: 'memory' }));
        } catch {
          toast.error(translate('purge.error', { ns: 'memory' }));
          throw new Error('Failed to purge memories');
        } finally {
          setLoading(false);
        }
      },
      title: translate('purge.title', { ns: 'memory' }),
    });
  };

  if (iconOnly) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <span style={{ display: 'inline-flex' }}>
                <ActionIcon
                  danger
                  icon={Trash2Icon}
                  loading={loading}
                  size={DESKTOP_HEADER_ICON_SMALL_SIZE}
                  tooltipProps={{ placement: 'bottom' }}
                  onClick={handleClick}
                />
              </span>
            }
          />
          <TooltipContent>{translate('purge.action', { ns: 'memory' })}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      loading={loading}
      size="sm"
      style={{ maxWidth: 300 }}
      variant="destructive"
      onClick={handleClick}
    >
      <Trash2Icon data-icon="inline-start" size={DESKTOP_HEADER_ICON_SIZE.size} />
      {translate('purge.action', { ns: 'memory' })}
    </Button>
  );
});

export default PurgeButton;
