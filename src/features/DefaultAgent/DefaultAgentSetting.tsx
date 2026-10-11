'use client';

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { toast } from '@/components/toast';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AgentRuntimeIcon } from '@/features/AgentRuntimeIcon';
import { useHomeAgentRows } from '@/features/Home/AgentSelect/useHomeAgentRows';

import { useDefaultAgent } from './useDefaultAgent';
import { useDefaultAgentPreference } from './useDefaultAgentPreference';

/**
 * Settings → Agents: which Agent the entry points open when the user named
 * none. Shows the resolved Agent, so the control never reads as empty while a
 * fallback is in effect.
 */
const DefaultAgentSetting = () => {
  const { t } = useTranslation('setting');
  const id = useId();
  const preference = useDefaultAgentPreference();
  const resolved = useDefaultAgent();
  const { privateRows, workspaceRows } = useHomeAgentRows();
  const rows = [...privateRows, ...workspaceRows];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [failedId, setFailedId] = useState<string>();

  const save = async (agentId: string) => {
    setPending(true);
    setError(undefined);
    try {
      await preference.save(agentId);
      toast.success(t('defaultAgentPicker.saved'));
    } catch (cause) {
      setFailedId(agentId);
      setError(cause);
    } finally {
      setPending(false);
    }
  };

  // Nothing to choose from: the setup prompt above already asks for an Agent.
  if (!rows.length) return null;

  const current = rows.find((row) => row.id === resolved?.agentId);

  return (
    <div className="flex flex-col gap-2 rounded-(--radius-card) border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={id}>{t('defaultAgentPicker.title')}</Label>
          <p className="text-xs leading-5 text-muted-foreground">
            {t('defaultAgentPicker.description')}
          </p>
        </div>
        <Select
          disabled={pending || preference.loading}
          value={current?.id ?? null}
          onValueChange={(value) => {
            if (value && value !== preference.agentId) void save(value);
          }}
        >
          <SelectTrigger className="w-full sm:w-60" id={id}>
            <SelectValue>{() => current?.title ?? t('defaultAgentPicker.choose')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {rows.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                <AgentRuntimeIcon size={16} type={row.heterogeneousType ?? undefined} />
                {row.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {resolved && resolved.source !== 'default' && (
        <p className="text-xs leading-5 text-muted-foreground">
          {t(`defaultAgentPicker.fallback.${resolved.source}`)}
        </p>
      )}
      {(error || preference.error) && (
        <AsyncError
          error={error ?? preference.error}
          variant="inline"
          onRetry={() => void (error && failedId ? save(failedId) : preference.retry())}
        />
      )}
    </div>
  );
};

export default DefaultAgentSetting;
