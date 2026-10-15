'use client';

import { agentDisplayName } from '@orvilo/types';
import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ShareButton from '@/business/client/features/PageShare/ShareButton';
import ActionIcon from '@/components/ActionIcon';
import AsyncError from '@/components/AsyncError';
import { DropdownMenu } from '@/components/ItemsMenu';
import { Button } from '@/components/ui/button';
import AutoSaveHint from '@/features/EditorCanvas/AutoSaveHint';
import NavHeader from '@/features/NavHeader';
import { saveNativePageBeforeLeave } from '@/features/PageEditor/native/nativePageActions';
import { useNativePageChrome } from '@/features/PageEditor/native/NativePageEditorAssembler';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useDocumentStore } from '@/store/document';

import { useNativeAgentDocumentMenu } from './useNativeMenu';

export interface NativeAgentDocumentHeaderProps {
  agentDocumentId?: string;
  agentId: string;
  documentId: string;
  itemError?: unknown;
  onBack: () => void;
  onDeleted: () => void;
  title?: string;
  updatedAt?: Date | string | null;
}
/** Mount only under NativeCompletePageEditor via its explicit nativeHeader slot.
 * Legacy Header/useMenu stay unchanged beneath the disabled default gate. */
export function NativeAgentDocumentHeader(props: NativeAgentDocumentHeaderProps) {
  const { t } = useTranslation(['file', 'chat', 'common']);
  const state = useNativePageChrome();
  const meta = useAgentStore(agentSelectors.getAgentMetaById(props.agentId));
  const menu = useNativeAgentDocumentMenu(props);
  const [backError, setBackError] = useState<unknown>();
  const [leaving, setLeaving] = useState(false);
  const back = async () => {
    if (leaving) return;
    setBackError(undefined);
    setLeaving(true);
    try {
      if (state.editor)
        await saveNativePageBeforeLeave({
          documentId: props.documentId,
          editor: state.editor,
          flushMetadata: state.metadata.flush,
          getState: useDocumentStore.getState,
          failedMessage: t('pageEditor.saveFailed', { ns: 'file' }),
        });
      else if (state.metadata.dirty) throw new Error(t('pageEditor.saveFailed', { ns: 'file' }));
      props.onBack();
    } catch (error) {
      setBackError(error);
    } finally {
      setLeaving(false);
    }
  };
  const showTitleError = !!props.itemError && !props.title;
  const title = showTitleError
    ? t('workingPanel.resources.error', { ns: 'chat' })
    : state.title || props.title || t('pageEditor.titlePlaceholder', { ns: 'file' });
  return (
    <>
      <NavHeader
        left={
          <div className="flex min-w-0 items-center gap-1 text-sm">
            <Button
              className="flex-none text-muted-foreground"
              disabled={leaving}
              size="compact"
              variant="ghost"
              onClick={() => {
                void back();
              }}
            >
              {agentDisplayName(meta, t('untitledAgent', { ns: 'chat' }))}
            </Button>
            <span aria-hidden="true" className="text-foreground-quaternary">
              /
            </span>
            <span
              className={
                showTitleError
                  ? 'min-w-0 truncate font-medium text-destructive-text'
                  : 'min-w-0 truncate font-medium'
              }
            >
              {title}
            </span>
            <DropdownMenu items={menu.menuItems} placement="bottomLeft" popupClassName="min-w-50">
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
            <AutoSaveHint documentId={props.documentId} />
            <ShareButton documentId={props.documentId} />
            <ToggleRightPanelButton hideWhenExpanded />
          </div>
        }
      />
      {backError ? (
        <AsyncError
          error={backError}
          retrying={leaving}
          variant="inline"
          onRetry={() => {
            void back();
          }}
        />
      ) : null}
      {menu.error ? (
        <AsyncError error={menu.error} retrying={menu.busy} variant="inline" onRetry={menu.retry} />
      ) : null}
    </>
  );
}
