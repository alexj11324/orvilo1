'use client';

import { MoreHorizontal, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import ShareButton from '@/business/client/features/PageShare/ShareButton';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AutoSaveHint from '@/features/EditorCanvas/AutoSaveHint';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useNativePageHeaderMenu } from '@/features/PageEditor/native/chrome/NativePageHeader';
import { useNativePageChrome } from '@/features/PageEditor/native/NativePageEditorAssembler';
import { usePageAgentPanelControl } from '@/features/PageEditor/RightPanel/OverrideContext';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';

const NativeDocumentModalHeader = () => {
  const { t } = useTranslation(['file', 'common']);
  const { close } = useModalContext();
  const state = useNativePageChrome();
  const { documentId, emoji, title } = state;
  const isDocumentLoading = useDocumentStore(editorSelectors.isDocumentLoading(documentId));
  const { expand: showPageAgentPanel, toggle: togglePageAgentPanel } = usePageAgentPanelControl();
  const { menuItems, error, busy, retry, run } = useNativePageHeaderMenu(state);

  return (
    <>
      <div className="flex h-11 flex-none items-center justify-between gap-1 p-2 [border-block-end:1px_solid_var(--divider)]">
        <div className="flex min-w-0 items-center gap-1.5 [&>[data-slot=badge]]:ms-1">
          {emoji && <Avatar avatar={emoji} shape={'square'} size={24} />}
          {isDocumentLoading && !title ? (
            <Skeleton className="h-3.5 w-30 min-w-30" />
          ) : (
            <div className="block min-w-0 truncate text-base font-semibold leading-6">
              {title || t('pageEditor.titlePlaceholder')}
            </div>
          )}
          {documentId && !isDocumentLoading && <AutoSaveHint documentId={documentId} />}
          <SidebarDropdownMenu items={menuItems} placement={'bottomLeft'} popupClassName="min-w-50">
            <Button
              aria-label={t('more', { ns: 'common' })}
              className="text-muted-foreground hover:text-foreground active:text-foreground"
              size="icon"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal className="size-4" fill="transparent" strokeWidth={2} />
            </Button>
          </SidebarDropdownMenu>
        </div>
        <div className="flex items-center gap-1">
          {documentId && (
            <span className="[&_button:not(:hover,:focus-visible)]:bg-transparent">
              <ShareButton documentId={documentId} />
            </span>
          )}
          <ToggleRightPanelButton
            expand={showPageAgentPanel}
            showActive={false}
            size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
            onToggle={() => togglePageAgentPanel()}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={t('close', { ns: 'common' })}
                  className="text-muted-foreground hover:text-foreground active:text-foreground"
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={close}
                >
                  <XIcon className="size-4" fill="transparent" strokeWidth={2} />
                </Button>
              }
            />
            <TooltipContent>{t('close', { ns: 'common' })}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {error ? (
        <AsyncError
          error={error}
          retrying={busy}
          variant="inline"
          onRetry={retry ? () => run(retry) : undefined}
        />
      ) : null}
    </>
  );
};

export default NativeDocumentModalHeader;
