'use client';

import { agentDisplayName } from '@orvilo/types';
import { cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { MoreHorizontal } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ShareButton from '@/business/client/features/PageShare/ShareButton';
import ActionIcon from '@/components/ActionIcon';
import { DropdownMenu } from '@/components/ItemsMenu';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { AutoSaveHint } from '@/features/EditorCanvas';
import NavHeader from '@/features/NavHeader';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { oneLineEllipsis } from '@/styles';

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
          <div className="flex items-center gap-1" style={{ minWidth: 0 }}>
            {/* Breadcrumb: agent → document. The agent label returns to chat. */}
            <div
              className="flex items-center"
              style={{ cursor: 'pointer', flexShrink: 0 }}
              onClick={onBack}
            >
              <div style={{ color: cssVar.colorTextSecondary }}>
                {agentDisplayName(meta, t('untitledAgent', { ns: 'chat' }))}
              </div>
            </div>
            <div style={{ color: cssVar.colorTextQuaternary, flexShrink: 0 }}>/</div>
            <div
              className={cn('font-medium', cx(oneLineEllipsis))}
              style={{ color: showTitleError ? cssVar.colorError : undefined, minWidth: 0 }}
            >
              {resolvedTitle}
            </div>
            <DropdownMenu
              iconSpaceMode={'group'}
              items={menuItems}
              placement={'bottomLeft'}
              popupProps={{ style: { minWidth: 200 } }}
            >
              <ActionIcon icon={MoreHorizontal} size={DESKTOP_HEADER_ICON_SMALL_SIZE} />
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
