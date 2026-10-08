'use client';

import type { HeterogeneousAgentPermissionCatalog } from '@orvilo/types';
import { snapshotTopicExecutionConfig } from '@orvilo/types';
import { CheckIcon, ChevronDownIcon, ShieldIcon } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentComposerAgentId } from '@/features/ChatInput/hooks/useAgentId';
import { resolveExecutionTarget } from '@/helpers/executionTarget';
import { useEffectiveWorkingDirectory } from '@/hooks/useEffectiveWorkingDirectory';
import { useTopicAgencyConfig } from '@/hooks/useTopicAgencyConfig';
import { heterogeneousAgentService } from '@/services/electron/heterogeneousAgent';
import { heterogeneousAgentCatalogService } from '@/services/heterogeneousAgent';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

import { fingerprintConfig } from '../HeteroModel/useModelCatalog';
import { persistPermissionChoice } from './persistPermissionChoice';

/** ACP choices are opaque: display and persist the exact advertised names and values. */
export const PermissionSelector = ({ agentId }: { agentId: string }) => {
  const { t } = useTranslation('chat');
  const getCurrentComposerAgentId = useCurrentComposerAgentId();
  const [requested, setRequested] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { agencyConfig, workspaceScoped, isPreferenceLoading } = useTopicAgencyConfig(agentId);
  const provider = agencyConfig?.heterogeneousProvider;
  const topicId = useChatStore(topicSelectors.activeTopicIdForAgent(agentId));
  const executionConfig = useChatStore((s) =>
    topicId ? topicSelectors.getTopicById(topicId)(s)?.metadata?.executionConfig : undefined,
  );
  const cwd = useEffectiveWorkingDirectory(agentId);
  const target = resolveExecutionTarget(agencyConfig, {
    clientExecutionAvailable: heterogeneousAgentService.supportsLocalExecution,
    isHetero: !!provider,
    workspaceScoped,
  });
  const deviceId = target === 'device' ? agencyConfig?.boundDeviceId : undefined;
  const targetReady =
    (target === 'local' && heterogeneousAgentService.supportsLocalExecution) ||
    (target === 'device' && !!deviceId);
  const { data, error, isLoading, isValidating, mutate } = useSWR<
    HeterogeneousAgentPermissionCatalog[]
  >(
    (requested || !!provider?.permission) &&
      targetReady &&
      !isPreferenceLoading &&
      provider &&
      provider.type !== 'orvilo'
      ? [
          'heterogeneous-agent-permissions',
          provider.type,
          deviceId ?? 'local',
          cwd ?? '',
          provider.command ?? '',
          fingerprintConfig(provider),
        ]
      : null,
    () =>
      heterogeneousAgentCatalogService.listPermissions({
        type: provider!.type,
        args: provider?.args,
        command: provider?.command,
        cwd,
        deviceId,
        env: provider?.env,
      }),
    { dedupingInterval: 300_000, revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const selected = provider?.permission;
  const selectedCatalog = data?.find((catalog) => catalog.configId === selected?.configId);
  const selectedOption = selectedCatalog?.options.find(
    (option) => option.value === selected?.value,
  );
  const firstCatalog = data?.[0];
  const currentOption = firstCatalog?.options.find(
    (option) => option.value === firstCatalog.currentValue,
  );
  const label = selected
    ? error
      ? t('heteroAgent.permission.unavailable')
      : !data
        ? targetReady
          ? t('heteroAgent.permission.loading')
          : t('heteroAgent.permission.label')
        : (selectedOption?.name ?? t('heteroAgent.permission.stale'))
    : (currentOption?.name ?? t('heteroAgent.permission.label'));

  const choose = async (configId: string, value: string) => {
    if (!provider || saving) return;
    setSaving(true);
    try {
      await persistPermissionChoice(useChatStore.getState, {
        agentId,
        getCurrentComposerAgentId,
        topicId,
        executionConfig: executionConfig ?? snapshotTopicExecutionConfig(agencyConfig),
        permission: { provider: provider.type, configId, value },
      });
    } catch (saveError) {
      console.error('Failed to save ACP permission selection:', saveError);
      toast.error(t('heteroAgent.permission.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setRequested(true);
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t('heteroAgent.permission.label')}
            className={`h-6 gap-1 px-1 text-xs ${open ? 'bg-muted' : ''}`}
            disabled={!targetReady || isPreferenceLoading || saving}
            size="sm"
            variant="ghost"
          >
            <ShieldIcon size={14} />
            {label}
            <ChevronDownIcon size={12} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-32px)]">
        {isLoading || (isValidating && !data) || (requested && !data && !error) ? (
          <DropdownMenuItem disabled>{t('heteroAgent.permission.loading')}</DropdownMenuItem>
        ) : error ? (
          <>
            <DropdownMenuItem disabled>{t('heteroAgent.permission.unavailable')}</DropdownMenuItem>
            <DropdownMenuItem
              closeOnClick={false}
              onClick={() => {
                void mutate().catch((refreshError) => {
                  console.error('Failed to refresh ACP permissions:', refreshError);
                });
              }}
            >
              {t('retry', { ns: 'common' })}
            </DropdownMenuItem>
          </>
        ) : !data?.length ? (
          <DropdownMenuItem disabled>{t('heteroAgent.permission.unsupported')}</DropdownMenuItem>
        ) : (
          data.map((catalog, index) => (
            <Fragment key={catalog.configId}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                <DropdownMenuLabel>{catalog.name}</DropdownMenuLabel>
                {catalog.options.map((option) => {
                  const chosen = selected
                    ? selected.configId === catalog.configId && selected.value === option.value
                    : catalog.currentValue === option.value;
                  return (
                    <DropdownMenuItem
                      aria-current={chosen ? 'true' : undefined}
                      className={chosen ? 'bg-muted hover:bg-accent' : undefined}
                      disabled={saving}
                      key={option.value}
                      onClick={() => void choose(catalog.configId, option.value)}
                    >
                      <div className="flex flex-col flex-1">
                        <span>{option.name}</span>
                        {option.description && (
                          <span className="text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </div>
                      {chosen && <CheckIcon size={14} />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </Fragment>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
