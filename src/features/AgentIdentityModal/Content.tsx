'use client';

import { numberedAgentName } from '@orvilo/const';
import { getHeterogeneousTypeLabel } from '@orvilo/heterogeneous-agents';
import { cssVar } from 'antd-style';
import { cn } from 'cn';
import { DicesIcon } from 'lucide-react';
import { memo, type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

import { useAgentIdentityForm } from './useAgentIdentityForm';

interface FieldProps {
  children: ReactNode;
  hint?: ReactNode;
  label: string;
}

const Field = memo<FieldProps>(({ label, hint, children }) => (
  <div className="flex flex-col gap-1.5">
    <div className="text-muted-foreground">{label}</div>
    {children}
    {hint}
  </div>
));

interface AgentIdentityContentProps {
  agentId: string;
}

/**
 * The three identity fields as a real form. They used to be inline inputs in the
 * profile header, which crowded it and left no room for a per-field label or
 * error. All behaviour lives in {@link useAgentIdentityForm}.
 */
const AgentIdentityContent = memo<AgentIdentityContentProps>(({ agentId }) => {
  const { t } = useTranslation(['setting', 'common']);
  const { close } = useModalContext();
  const form = useAgentIdentityForm({ agentId, onSaved: close });
  const { setName } = form;

  // Same deterministic suggestion as the header's "name it for me" button and
  // agent creation: the agent's own type name, numbered when the sidebar
  // already has one. Read at click time — the list only matters at that moment.
  const rollName = useCallback(() => {
    const agents = homeAgentListSelectors.allAgents(useHomeStore.getState());
    const agent = agents.find((a) => a.id === agentId);
    const takenNames = agents
      .filter((a) => a.id !== agentId)
      .map((a) => a.name)
      .filter((name): name is string => !!name);
    const base =
      agent?.title?.trim() ||
      (agent?.heterogeneousType ? getHeterogeneousTypeLabel(agent.heterogeneousType) : undefined) ||
      'Orvilo AI';

    setName(numberedAgentName(base, takenNames));
  }, [agentId, setName]);

  return (
    <div className="flex flex-col gap-5 p-5">
      <Field label={t('settingAgent.personalName.label', { ns: 'setting' })}>
        <InputGroup>
          <InputGroupInput
            autoFocus
            placeholder={t('settingAgent.personalName.placeholder', { ns: 'setting' })}
            value={form.name}
            onChange={(e) => form.setName(e.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <ActionIcon
              icon={DicesIcon}
              size={'small'}
              title={t('settingAgent.personalName.roll', { ns: 'setting' })}
              onClick={rollName}
            />
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <Field label={t('settingAgent.role.label', { ns: 'setting' })}>
        <InputGroupInput
          placeholder={t('settingAgent.role.placeholder', { ns: 'setting' })}
          value={form.title}
          onChange={(e) => form.setTitle(e.target.value)}
        />
      </Field>
      {/* A builtin agent's identifier is not an editable field at all, so it is
          not dressed as one: a disabled input still reads as "a control you
          can't use right now" and needs a sentence explaining itself. Rendering
          the bare marker states the fact and needs no caption. */}
      {form.slugLocked ? (
        <Field label={t('settingAgent.slug.label', { ns: 'setting' })}>
          <div
            className="font-mono rounded bg-muted px-1"
            style={{ alignSelf: 'flex-start', color: cssVar.colorTextSecondary }}
          >
            <span style={{ color: cssVar.colorTextTertiary }}>@</span>
            {form.slug}
          </div>
        </Field>
      ) : (
        <Field
          label={t('settingAgent.slug.label', { ns: 'setting' })}
          hint={
            <div
              className={cn(form.error ? 'text-destructive' : 'text-muted-foreground')}
              style={{ fontSize: 12 }}
            >
              {/* Show the url the current input actually produces — a literal
                  `<slug>` leaves the reader to do the substitution themselves,
                  and it updates as they type. Only an empty field falls back to
                  describing the field in the abstract. */}
              {form.error ??
                (form.slug.trim()
                  ? t('settingAgent.slug.openWith', {
                      ns: 'setting',
                      slug: form.slug.trim().toLowerCase(),
                    })
                  : t('settingAgent.slug.tooltip', { ns: 'setting' }))}
            </div>
          }
        >
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <InputGroupText>@</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              aria-invalid={form.error ? true : undefined}
              placeholder={t('settingAgent.slug.placeholder', { ns: 'setting' })}
              value={form.slug}
              onChange={(e) => form.setSlug(e.target.value)}
            />
          </InputGroup>
        </Field>
      )}
      <div className="flex gap-2 justify-end">
        <Button disabled={form.saving} onClick={() => close()}>
          {t('cancel', { ns: 'common' })}
        </Button>
        <Button
          disabled={form.saving}
          loading={form.saving}
          variant="default"
          onClick={() => {
            void form.save();
          }}
        >
          {t('save', { ns: 'common' })}
        </Button>
      </div>
    </div>
  );
});

export default AgentIdentityContent;
