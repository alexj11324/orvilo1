import { agentDisplayName } from '@orvilo/types';
import { Command } from 'cmdk';
import { cn } from 'cn';
import { ArrowLeft, XIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge as Tag } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import { useCommandMenuContext } from '../CommandMenuContext';
import { styles } from '../styles';
import { useCommandMenu } from '../useCommandMenu';
import { type ValidSearchType } from '../utils/queryParser';

interface CommandInputProps {
  onInputChange: (value: string) => void;
  onTypeFilterChange: () => void;
}

const CommandInput = memo<CommandInputProps>(({ onInputChange, onTypeFilterChange }) => {
  const { t } = useTranslation('common');

  const { handleBack } = useCommandMenu();
  const {
    menuContext,
    pages,
    page,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    selectedAgent,
    setSelectedAgent,
    activeAgentId,
  } = useCommandMenuContext();

  const activeAgentMeta = useAgentStore((s) =>
    activeAgentId ? agentSelectors.getAgentMetaById(activeAgentId)(s) : undefined,
  );

  const hasPages = pages.length > 0;
  const hasSelectedAgent = !!selectedAgent;
  const hasActiveAgent = !!activeAgentId && menuContext === 'agent';

  // Get localized context name
  const contextName = t(`cmdk.context.${menuContext}`, { defaultValue: menuContext });

  const getTypeLabel = (type: ValidSearchType) => {
    return t(`cmdk.search.${type}`);
  };

  const getPlaceholder = () => {
    if (hasSelectedAgent) {
      return t('cmdk.askAgentPlaceholder', { agent: agentDisplayName(selectedAgent) });
    }
    if (page === 'ask-ai') {
      return t('cmdk.aiModePlaceholder');
    }
    return t('cmdk.searchPlaceholder');
  };

  return (
    <>
      {(menuContext !== 'general' || typeFilter) && !hasPages && !hasSelectedAgent && (
        <div className={styles.contextWrapper}>
          {hasActiveAgent ? (
            <Tag className={cn(styles.contextTag)}>
              <AssigneeAvatar agentId={activeAgentId} size={14} />
              {agentDisplayName(activeAgentMeta, t('defaultAgent'))}
            </Tag>
          ) : (
            menuContext !== 'general' && <Tag className={cn(styles.contextTag)}>{contextName}</Tag>
          )}
          {typeFilter && (
            <span className="inline-flex pointer-coarse:py-[calc(var(--spacing)*1.75)]">
              <Button
                size="compact"
                type="button"
                variant="ghost"
                className={cn(
                  styles.backTag,
                  "relative pointer-coarse:min-w-11 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-px pointer-coarse:after:-inset-y-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']",
                )}
                onClick={() => {
                  onTypeFilterChange();
                  setTypeFilter(undefined);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
                }}
              >
                <XIcon size={16} />
                {getTypeLabel(typeFilter)}
              </Button>
            </span>
          )}
        </div>
      )}
      <div className={styles.inputWrapper}>
        {hasPages && !hasSelectedAgent && (
          <span className="inline-flex pointer-coarse:p-[calc(var(--spacing)*1.75)]">
            <Button
              aria-label={t('back')}
              size="icon"
              type="button"
              variant="ghost"
              className={cn(
                styles.backTag,
                "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']",
              )}
              onClick={handleBack}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
              }}
            >
              <ArrowLeft size={16} />
            </Button>
          </span>
        )}
        {hasSelectedAgent && (
          <Tag>
            <AssigneeAvatar agentId={selectedAgent.id} size={14} />
            {agentDisplayName(selectedAgent)}
            <span className="inline-flex pointer-coarse:p-[calc(var(--spacing)*1.75)]">
              <Button
                aria-label={t('close', { ns: 'common' })}
                className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']"
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => setSelectedAgent(undefined)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
                }}
              >
                <XIcon size={16} />
              </Button>
            </span>
          </Tag>
        )}
        <Command.Input
          autoFocus
          maxLength={500}
          placeholder={getPlaceholder()}
          value={search}
          onValueChange={(value) => {
            onInputChange(value);
            setSearch(value);
          }}
        />
        {page !== 'ask-ai' && !hasSelectedAgent && search.trim() ? (
          <>
            <span className="text-sm leading-5.5 text-muted-foreground">{t('cmdk.askAI')}</span>
            <Tag>{t('cmdk.keyboard.Tab')}</Tag>
          </>
        ) : (
          <Tag>{t('cmdk.keyboard.ESC')}</Tag>
        )}
      </div>
    </>
  );
});

CommandInput.displayName = 'CommandInput';

export default CommandInput;
