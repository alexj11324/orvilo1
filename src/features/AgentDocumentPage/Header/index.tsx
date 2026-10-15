'use client';

import { agentDisplayName } from '@orvilo/types';
import { cn } from 'cn';
import { MoreHorizontal } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ShareButton from '@/business/client/features/PageShare/ShareButton';
import ActionIcon from '@/components/ActionIcon';
import { DropdownMenu } from '@/components/ItemsMenu';
import AutoSaveHint from '@/features/EditorCanvas/AutoSaveHint';
import NavHeader from '@/features/NavHeader';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { useMenu } from './useMenu';

interface HeaderProps {
  agentDocumentId?: string;
  agentId: string;
  documentId: string;
  itemError?: unknown;
  onBack: () => void;
  onDeleted: () => void;
  title?: string;
  updatedAt?: Date | string | null;
}

const Header = memo<HeaderProps>(
  ({ agentId, agentDocumentId, documentId, itemError, onBack, onDeleted, title, updatedAt }) => {
    const { t } = useTranslation(['file', 'chat']);
    const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId));
    const showTitleError = !!itemError && !title;
    const resolvedTitle = showTitleError
      ? t('workingPanel.resources.error', { ns: 'chat' })
      : title || t('pageEditor.titlePlaceholder');
    const { menuItems } = useMenu({
      agentDocumentId,
      agentId,
      documentId,
      onDeleted,
      title,
      updatedAt,
    });

    return (
      <NavHeader
        left={
          <div className="flex min-w-0 items-center gap-1 text-sm leading-5.5">
            {/* Breadcrumb: agent → document. The agent label returns to chat. */}
            <div
              {...clickableProps()}
              className={cn(
                'flex min-h-8 flex-none cursor-pointer items-center',
                CLICKABLE_FOCUS_RING,
              )}
              onClick={onBack}
            >
              <div className="text-muted-foreground">
                {agentDisplayName(meta, t('untitledAgent', { ns: 'chat' }))}
              </div>
            </div>
            <div className="flex-none text-foreground-quaternary">/</div>
            <div
              className={cn(
                'min-w-0 truncate font-medium',
                showTitleError && 'text-destructive-text',
              )}
            >
              {resolvedTitle}
            </div>
            <DropdownMenu items={menuItems} placement={'bottomLeft'} popupClassName="min-w-50">
              <ActionIcon
                aria-label={t('more', { ns: 'common' })}
                icon={MoreHorizontal}
                size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              />
            </DropdownMenu>
          </div>
        }
        right={
          <div className="flex items-center gap-1">
            {documentId && <AutoSaveHint documentId={documentId} />}
            {documentId && <ShareButton documentId={documentId} />}
            <ToggleRightPanelButton hideWhenExpanded />
          </div>
        }
      />
    );
  },
);

Header.displayName = 'AgentDocumentPageHeader';

export default Header;
