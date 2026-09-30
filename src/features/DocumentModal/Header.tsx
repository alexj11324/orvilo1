'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { MoreHorizontal, XIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ShareButton from '@/business/client/features/PageShare/ShareButton';
import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { DropdownMenu } from '@/components/ItemsMenu';
import { useModalContext } from '@/components/Modal';
import { Skeleton } from '@/components/ui/skeleton';
import { DESKTOP_HEADER_ICON_SIZE, DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { AutoSaveHint } from '@/features/EditorCanvas';
import { useMenu } from '@/features/PageEditor/Header/useMenu';
import { usePageAgentPanelControl } from '@/features/PageEditor/RightPanel/OverrideContext';
import { usePageEditorStore } from '@/features/PageEditor/store';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';

const HEADER_HEIGHT = 44;

const styles = createStaticStyles(({ css }) => ({
  shareButton: css`
    & button:not(:hover, :focus-visible) {
      background: transparent;
    }
  `,
}));

interface DocumentModalHeaderProps {
  onDeleted?: () => void;
}

const DocumentModalHeader = memo<DocumentModalHeaderProps>(({ onDeleted }) => {
  const { t } = useTranslation(['file', 'common']);
  const { close } = useModalContext();
  const [documentId, emoji, title] = usePageEditorStore((s) => [s.documentId, s.emoji, s.title]);
  const isDocumentLoading = useDocumentStore(editorSelectors.isDocumentLoading(documentId));
  const { expand: showPageAgentPanel, toggle: togglePageAgentPanel } = usePageAgentPanelControl();
  const { menuItems } = useMenu({
    onDeleted: () => {
      close();
      onDeleted?.();
    },
    onOpenHistory: () => togglePageAgentPanel(true),
  });

  return (
    <div
      className="flex items-center flex-none gap-1 justify-between p-2"
      style={{ height: HEADER_HEIGHT, borderBlockEnd: `1px solid ${cssVar.colorBorderSecondary}` }}
    >
      <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
        {emoji && <Avatar avatar={emoji} shape={'square'} size={24} />}
        {isDocumentLoading && !title ? (
          <Skeleton style={{ height: 14, minWidth: 120, width: 120 }} />
        ) : (
          <div className="truncate block font-medium" style={{ minWidth: 0 }}>
            {title || t('pageEditor.titlePlaceholder')}
          </div>
        )}
        {documentId && !isDocumentLoading && (
          <AutoSaveHint documentId={documentId} style={{ marginLeft: 4 }} />
        )}
        <DropdownMenu
          iconSpaceMode={'group'}
          items={menuItems}
          placement={'bottomLeft'}
          popupProps={{ style: { minWidth: 200 } }}
        >
          <ActionIcon icon={MoreHorizontal} size={DESKTOP_HEADER_ICON_SMALL_SIZE} />
        </DropdownMenu>
      </div>
      <div className="flex items-center gap-1">
        {documentId && (
          <span className={styles.shareButton}>
            <ShareButton documentId={documentId} />
          </span>
        )}
        <ToggleRightPanelButton
          expand={showPageAgentPanel}
          showActive={false}
          onToggle={() => togglePageAgentPanel()}
        />
        <ActionIcon
          icon={XIcon}
          size={DESKTOP_HEADER_ICON_SIZE}
          title={t('close', { ns: 'common' })}
          onClick={close}
        />
      </div>
    </div>
  );
});

DocumentModalHeader.displayName = 'DocumentModalHeader';

export default DocumentModalHeader;
