'use client';

import { useTranslation } from 'react-i18next';

import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';
import { useSaveState } from '@/hooks/useSaveState';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import { SettingsGroup, SettingsRow, settingsStyles } from './SettingsGroup';

export const AgentOpeningSettings = ({ agentId }: { agentId: string }) => {
  const { t } = useTranslation('setting');
  const { allowed: canEdit } = usePermission('edit_own_content');
  const config = useAgentStore(agentSelectors.getAgentConfigById(agentId));
  const update = useAgentStore((s) => s.updateAgentConfigById);
  const messageSave = useSaveState();
  const questionsSave = useSaveState();
  return (
    <SettingsGroup title={t('settingAgent.opening.title')}>
      <SettingsRow label={t('settingAgent.opening.message')}>
        <div className="flex w-full flex-col gap-2">
          <Textarea
            aria-label={t('settingAgent.opening.message')}
            defaultValue={config.openingMessage ?? ''}
            disabled={!canEdit || messageSave.status === 'saving'}
            onBlur={(event) => {
              const openingMessage = event.target.value;
              if (openingMessage !== (config.openingMessage ?? ''))
                void messageSave.save(() => update(agentId, { openingMessage }, { rethrow: true }));
            }}
          />
          {messageSave.status !== 'idle' && (
            <AutoSaveHint
              lastUpdatedTime={messageSave.lastSavedAt}
              saveStatus={messageSave.status}
              onRetry={() => void messageSave.retry()}
            />
          )}
        </div>
      </SettingsRow>
      <SettingsRow label={t('settingAgent.opening.questions')}>
        <div className="flex w-full flex-col gap-2">
          <Textarea
            aria-label={t('settingAgent.opening.questions')}
            defaultValue={config.openingQuestions?.join('\n') ?? ''}
            disabled={!canEdit || questionsSave.status === 'saving'}
            onBlur={(event) => {
              const openingQuestions = event.target.value
                .split('\n')
                .map((question) => question.trim())
                .filter(Boolean);
              if (
                JSON.stringify(openingQuestions) !== JSON.stringify(config.openingQuestions ?? [])
              )
                void questionsSave.save(() =>
                  update(agentId, { openingQuestions }, { rethrow: true }),
                );
            }}
          />
          {questionsSave.status !== 'idle' && (
            <AutoSaveHint
              lastUpdatedTime={questionsSave.lastSavedAt}
              saveStatus={questionsSave.status}
              onRetry={() => void questionsSave.retry()}
            />
          )}
          <span className={settingsStyles.hint}>{t('settingAgent.opening.questionsHint')}</span>
        </div>
      </SettingsRow>
    </SettingsGroup>
  );
};

export default AgentOpeningSettings;
