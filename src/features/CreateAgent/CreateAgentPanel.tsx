'use client';

import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import type { AgentItem } from '@orvilo/types';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CreateAgentParams } from '@/services/agent';
import {
  createOnboardingAgentOnce,
  type FirstAgentCreationCheckpoint,
} from '@/services/agentOnboarding';
import { useAgentStore } from '@/store/agent';

import { BUILTIN_AGENT_KEY } from './agentOptions';
import { RuntimeFields, useAgentRuntimeForm } from './RuntimeFields';

export interface CreateAgentPanelProps {
  builtinOnly?: boolean;
  creationCheckpoint?: FirstAgentCreationCheckpoint;
  groupId?: string;
  initialType?: HeterogeneousAgentType;
  lockVisibility?: boolean;
  onCancel?: () => void;
  onCreated?: (agentId: string, config?: Partial<AgentItem>) => void | Promise<void>;
  visibility?: 'private' | 'public';
}

const CreateAgentPanel = ({
  builtinOnly,
  creationCheckpoint,
  groupId,
  initialType,
  lockVisibility,
  onCancel,
  onCreated,
  visibility = 'private',
}: CreateAgentPanelProps) => {
  const { t } = useTranslation(['chat', 'common']);
  const workspaceId = useActiveWorkspaceId();
  const [selectedVisibility, setSelectedVisibility] = useState<'private' | 'public'>(
    lockVisibility ? 'private' : visibility,
  );
  const form = useAgentRuntimeForm({ builtinOnly, initialType, visibility: selectedVisibility });
  const createAgent = useAgentStore((s) => s.createAgent);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>();
  const checkpoint = useRef<FirstAgentCreationCheckpoint>(
    creationCheckpoint ?? { requestId: crypto.randomUUID() },
  );
  const saved = useRef<Awaited<ReturnType<typeof createOnboardingAgentOnce>> | undefined>(
    undefined,
  );
  const submitting = useRef(false);
  const intent = useRef<CreateAgentParams | undefined>(undefined);
  useEffect(() => {
    if (!nameTouched)
      setName(form.choice === BUILTIN_AGENT_KEY ? 'Orvilo AI' : (form.provider?.title ?? ''));
  }, [form.choice, form.provider?.title, nameTouched]);
  const submit = async () => {
    if (submitting.current || !name.trim() || (!saved.current && !intent.current && !form.ready))
      return;
    submitting.current = true;
    setCreating(true);
    setError(undefined);
    try {
      if (!saved.current) {
        if (!intent.current) {
          const runtime = await form.prepare();
          intent.current = {
            config: { ...runtime, name: name.trim(), title: name.trim() },
            groupId,
            visibility: selectedVisibility,
          };
        }
        saved.current = await createOnboardingAgentOnce(
          checkpoint.current,
          intent.current,
          createAgent,
        );
      }
      form.setApiKey('');
      await onCreated?.(saved.current.agentId, saved.current.config);
    } catch (cause) {
      setError(cause);
    } finally {
      submitting.current = false;
      setCreating(false);
    }
  };
  const locked = creating || !!saved.current || !!checkpoint.current.attempted;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="flex flex-col gap-2 text-sm">
        {t('createAgent.name')}
        <Input
          required
          disabled={locked}
          placeholder={t('createAgent.namePlaceholder')}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameTouched(true);
          }}
        />
      </label>
      <RuntimeFields disabled={locked} form={form} />
      <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          {t('createAgent.moreSettings')}
          {workspaceId &&
            ` · ${t(selectedVisibility === 'private' ? 'createAgent.visibility.private' : 'createAgent.visibility.public')}`}
        </summary>
        <div className="flex flex-col gap-2 pt-3">
          {workspaceId ? (
            <label className="flex flex-col gap-2">
              {t('createAgent.visibility.label')}
              {lockVisibility ? (
                <span className="text-muted-foreground">{t('createAgent.visibility.private')}</span>
              ) : (
                <Select
                  disabled={locked || !!groupId}
                  value={selectedVisibility}
                  onValueChange={(value) => {
                    if (value !== 'private' && value !== 'public') return;
                    setSelectedVisibility(value);
                    setNameTouched(true);
                    form.host.select(undefined);
                    form.selectChoice(BUILTIN_AGENT_KEY);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {() =>
                        t(
                          selectedVisibility === 'private'
                            ? 'createAgent.visibility.private'
                            : 'createAgent.visibility.public',
                        )
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">{t('createAgent.visibility.private')}</SelectItem>
                    <SelectItem value="public">{t('createAgent.visibility.public')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </label>
          ) : (
            <span className="text-muted-foreground">{t('createAgent.visibility.personal')}</span>
          )}
          {groupId && <p className="text-muted-foreground">{t('createAgent.categoryPreserved')}</p>}
        </div>
      </details>
      {error !== undefined && (
        <AsyncError
          description={t('createAgent.failed')}
          error={error}
          variant="inline"
          onRetry={() => void submit()}
        />
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button disabled={creating} type="button" variant="outline" onClick={onCancel}>
            {t('common:cancel')}
          </Button>
        )}
        <Button
          disabled={creating || !name.trim() || (!saved.current && !intent.current && !form.ready)}
          loading={creating}
          type="submit"
        >
          {t('createAgent.create')}
        </Button>
      </div>
    </form>
  );
};
export default CreateAgentPanel;
