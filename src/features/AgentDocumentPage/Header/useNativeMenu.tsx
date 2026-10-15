'use client';

import { buildAgentDocumentUrl } from '@orvilo/builtin-tool-agent-documents';
import { isHostUnsupportedResult } from '@orvilo/types';
import { Download, Link2, Maximize2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import type { DropdownItem } from '@/components/ItemsMenu';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { formatPageEditorInfoTime } from '@/features/PageEditor/formatPageEditorInfoTime';
import { useNativePageChrome } from '@/features/PageEditor/native/NativePageEditorAssembler';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { usePermission } from '@/hooks/usePermission';
import { getHostPort } from '@/platform';
import { agentDocumentService } from '@/services/agentDocument';

export interface NativeAgentDocumentMenuParams {
  agentDocumentId?: string;
  agentId: string;
  documentId: string;
  onDeleted: () => void;
  title?: string;
  updatedAt?: Date | string | null;
}
/** Agent-document removal is a domain operation, never the ordinary page
 * deletion action from native page chrome. Native export reads the real kernel. */
export function useNativeAgentDocumentMenu(params: NativeAgentDocumentMenuParams) {
  const { t } = useTranslation(['file', 'common', 'chat']);
  const state = useNativePageChrome();
  const workspaceSlug = useActiveWorkspaceSlug();
  const { allowed: canEdit } = usePermission('edit_own_content');
  const { canManageResource } = useResourceAccess('agent', params.agentId);
  const [error, setError] = useState<unknown>();
  const [retry, setRetry] = useState<() => Promise<void>>();
  const [busy, setBusy] = useState(false);
  const run = (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    void action()
      .catch((nextError) => {
        setError(nextError);
        setRetry(() => action);
      })
      .finally(() => setBusy(false));
  };
  const copy = async () => {
    const origin = await getHostPort().document.resolveLink('/');
    if (isHostUnsupportedResult(origin))
      throw new Error(t('pageEditor.exportError', { ns: 'file' }));
    const url = buildAgentDocumentUrl(origin, params.agentId, params.documentId, { workspaceSlug });
    if (!url) throw new Error(t('pageEditor.exportError', { ns: 'file' }));
    await navigator.clipboard.writeText(url);
    toast.success(t('agentDocument.linkCopied', { ns: 'chat' }));
  };
  const exportMarkdown = async () => {
    const markdown = state.editor?.getDocument('markdown');
    if (typeof markdown !== 'string') throw new Error(t('pageEditor.exportError', { ns: 'file' }));
    const result = await getHostPort().document.exportMarkdown({
      content: markdown,
      fileName: `${state.title || params.title || 'Untitled'}.md`,
    });
    if (isHostUnsupportedResult(result))
      throw new Error(t('pageEditor.exportError', { ns: 'file' }));
  };
  const remove = () => {
    if (!params.agentDocumentId || !canEdit || !canManageResource) return;
    confirmModal({
      title: t('workingPanel.resources.deleteTitle', { ns: 'chat' }),
      content: t('workingPanel.resources.deleteConfirm', { ns: 'chat' }),
      cancelText: t('cancel', { ns: 'common' }),
      okText: t('delete', { ns: 'common' }),
      okButtonProps: { danger: true },
      onOk: async () => {
        const id = params.agentDocumentId;
        if (!id || !canEdit || !canManageResource) return;
        await agentDocumentService.removeDocument({
          agentId: params.agentId,
          documentId: params.documentId,
          id,
        });
        toast.success(t('workingPanel.resources.deleteSuccess', { ns: 'chat' }));
        params.onDeleted();
      },
    });
  };
  const updated = state.lastUpdatedTime ?? params.updatedAt;
  const menuItems: DropdownItem[] = [
    ...(state.canToggleWideScreen
      ? [
          {
            key: 'full-width',
            type: 'switch' as const,
            icon: <Maximize2 />,
            checked: state.wideScreen,
            label: t('viewMode.fullWidth', { ns: 'chat' }),
            onCheckedChange: state.toggleWideScreen,
          },
          { type: 'divider' as const },
        ]
      : []),
    {
      key: 'copy-link',
      disabled: busy,
      icon: <Link2 />,
      label: t('pageEditor.menu.copyLink', { ns: 'file' }),
      onClick: () => run(copy),
    },
    {
      key: 'export',
      icon: <Download />,
      label: t('pageEditor.menu.export', { ns: 'file' }),
      children: [
        {
          key: 'export-markdown',
          disabled: busy || !state.editor,
          label: t('pageEditor.menu.export.markdown', { ns: 'file' }),
          onClick: () => run(exportMarkdown),
        },
      ],
    },
    {
      key: 'delete',
      danger: true,
      disabled: !params.agentDocumentId || !canEdit || !canManageResource,
      icon: <Trash2 />,
      label: t('delete', { ns: 'common' }),
      onClick: remove,
    },
    ...(updated
      ? [
          { type: 'divider' as const },
          {
            key: 'doc-info',
            disabled: true,
            label: (
              <span className="text-xs text-foreground-tertiary">
                {t('pageEditor.editedAt', { ns: 'file', time: formatPageEditorInfoTime(updated) })}
              </span>
            ),
          },
        ]
      : []),
  ];
  return { menuItems, error, busy, retry: retry ? () => run(retry) : undefined };
}
