'use client';

import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import { ChevronDownIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldLabel } from '@/components/ui/field';
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
  onCreated?: (agentId: string, config?: CreateAgentParams['config']) => void | Promise<void>;
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
  const fieldId = useId();
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
      <Field>
        <FieldLabel htmlFor={`${fieldId}-name`}>{t('createAgent.name')}</FieldLabel>
        <Input
          required
          className="h-9"
          disabled={locked}
          id={`${fieldId}-name`}
          placeholder={t('createAgent.namePlaceholder')}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameTouched(true);
          }}
        />
      </Field>
      <RuntimeFields disabled={locked} form={form} />
      <Collapsible className="rounded-(--radius-card) border p-3 text-sm">
        <CollapsibleTrigger
          className="group/more flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm text-left text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          type="button"
        >
          <span>
            {t('createAgent.moreSettings')}
            {workspaceId &&
              ` · ${t(selectedVisibility === 'private' ? 'createAgent.visibility.private' : 'createAgent.visibility.public')}`}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-data-[panel-open]/more:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-2 pt-3">
          {workspaceId ? (
            <Field>
              <FieldLabel htmlFor={`${fieldId}-visibility`}>
                {t('createAgent.visibility.label')}
              </FieldLabel>
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
                  <SelectTrigger
                    className="w-full data-[size=default]:h-9"
                    id={`${fieldId}-visibility`}
                  >
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
            </Field>
          ) : (
            <span className="text-muted-foreground">{t('createAgent.visibility.personal')}</span>
          )}
          {groupId && <p className="text-muted-foreground">{t('createAgent.categoryPreserved')}</p>}
        </CollapsibleContent>
      </Collapsible>
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
          <Button disabled={creating} size="lg" type="button" variant="outline" onClick={onCancel}>
            {t('common:cancel')}
          </Button>
        )}
        <Button
          disabled={creating || !name.trim() || (!saved.current && !intent.current && !form.ready)}
          loading={creating}
          size="lg"
          type="submit"
        >
          {t('createAgent.create')}
        </Button>
      </div>
    </form>
  );
};
export default CreateAgentPanel;
