import { agentDisplayName } from '@orvilo/types';
import { Command } from 'cmdk';
import { cn } from 'cn';
import { ArrowLeft, XIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge as Tag } from '@/components/reui/badge';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { Button } from '@/components/ui/button';
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
            <Tag
              className={cn(styles.backTag)}
              onClick={() => {
                onTypeFilterChange();
                setTypeFilter(undefined);
              }}
            >
              <XIcon size={12} />
              {getTypeLabel(typeFilter)}
            </Tag>
          )}
        </div>
      )}
      <div className={styles.inputWrapper}>
        {hasPages && !hasSelectedAgent && (
          <Tag className={cn(styles.backTag)} onClick={handleBack}>
            <ArrowLeft size={12} />
          </Tag>
        )}
        {hasSelectedAgent && (
          <Tag>
            <AssigneeAvatar agentId={selectedAgent.id} size={14} />
            {agentDisplayName(selectedAgent)}
            <Button
              aria-label={t('close', { ns: 'common' })}
              className="size-4 rounded-sm"
              size="icon-xs"
              type="button"
              variant="ghost"
              onClick={() => setSelectedAgent(undefined)}
            >
              <XIcon size={12} />
            </Button>
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
            <span style={{ fontSize: '14px', opacity: 0.6 }}>{t('cmdk.askAI')}</span>
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
