'use client';

import { isDesktop } from '@orvilo/const';
import { RENDERER_HANDLED_LINK_ATTR } from '@orvilo/desktop-bridge';
import { BotIcon, CheckSquareIcon, FileTextIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { createElement, memo, useCallback } from 'react';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { shouldHardNavigateToWorkbench } from '@/libs/next/workbenchNavigation';
import { useClientDataSWR } from '@/libs/swr';
import { agentDocumentService, agentDocumentSWRKeys } from '@/services/agentDocument';
import { useAgentStore } from '@/store/agent';
import { useChatStore } from '@/store/chat';

import referenceStyles from '../../ReferenceRender.module.css';
import { type InternalLinkReference, isBareLinkLabel } from '../internalLink';
import {
  getPreviewData,
  InternalEntityPreview,
  internalEntityPreviewKey,
} from './InternalEntityPreview';

const styles = {
  icon: 'me-1 size-4 text-muted-foreground align-[-0.15em]',
};

const ENTITY_ICONS = {
  agent: BotIcon,
  document: FileTextIcon,
  task: CheckSquareIcon,
} as const;

interface InternalEntityLinkProps {
  href: string;
  label: string;
  reference: InternalLinkReference;
}

export const InternalEntityLink = memo<InternalEntityLinkProps>(({ href, label, reference }) => {
  const navigate = useWorkspaceAwareNavigate();
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const [openAgentDetail, openDocument, openTaskDetail] = useChatStore((s) => [
    s.openAgentDetail,
    s.openDocument,
    s.openTaskDetail,
  ]);
  // A pasted URL says nothing about what it points to, so resolve the entity's
  // own title and show that instead — the same read the hover preview makes,
  // under the same key, so the eager fetch also makes the hover card instant.
  // Bare links are sparse in real messages, which is why prefetching the full
  // preview beats a dedicated title read. Cross-workspace links are skipped:
  // the ambient client resolves against the ACTIVE scope, where a
  // workspace-unique id like T-198 can name a different entity entirely.
  // Authored link text is never replaced; a failed read just leaves the URL.
  const shouldResolveTitle =
    reference.type !== 'route' && !reference.workspaceSlug && isBareLinkLabel(label, href);
  const { data: entity } = useClientDataSWR(
    shouldResolveTitle ? internalEntityPreviewKey(reference) : null,
    () => getPreviewData(reference),
    { revalidateOnFocus: false },
  );
  const displayLabel = (shouldResolveTitle && entity?.title) || label;

  const linkedAgentId = reference.type === 'document' ? reference.agentId : undefined;
  const shouldResolveAgentDocument = !!linkedAgentId && linkedAgentId === activeAgentId;
  const { data: agentDocuments, mutate: resolveAgentDocuments } = useClientDataSWR(
    shouldResolveAgentDocument ? agentDocumentSWRKeys.documentsList(linkedAgentId) : null,
    () => agentDocumentService.listDocuments({ agentId: linkedAgentId! }),
  );

  const handleClick = useCallback(
    async (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.button !== 0) return;

      // On the web a modifier-click means "open in a new tab", so let the browser
      // handle it. Desktop has no tabs: falling through would hand the OS an
      // `app://renderer/...` URL, which silently opens nothing.
      const modifierClick = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (!isDesktop && modifierClick) return;

      event.preventDefault();

      if (reference.type === 'document' && shouldHardNavigateToWorkbench(reference.pathname)) {
        window.location.assign(reference.pathname);
        return;
      }

      if ('workspaceSlug' in reference && reference.workspaceSlug) {
        navigate(reference.pathname, { escape: true });
        return;
      }

      if (
        reference.type === 'document' &&
        reference.agentId &&
        reference.agentId !== activeAgentId
      ) {
        navigate(reference.pathname, { escape: true });
        return;
      }

      switch (reference.type) {
        case 'agent': {
          openAgentDetail(reference.agentId);
          break;
        }
        case 'document': {
          const documents = shouldResolveAgentDocument
            ? (agentDocuments ?? (await resolveAgentDocuments().catch(() => undefined)))
            : undefined;
          const agentDocumentId = documents?.find(
            (document) => document.documentId === reference.documentId,
          )?.id;

          openDocument(reference.documentId, agentDocumentId);
          break;
        }
        case 'task': {
          openTaskDetail(reference.taskId);
          break;
        }
        case 'route': {
          navigate(reference.pathname);
          break;
        }
      }
    },
    [
      activeAgentId,
      agentDocuments,
      navigate,
      openAgentDetail,
      openDocument,
      openTaskDetail,
      reference,
      resolveAgentDocuments,
      shouldResolveAgentDocument,
    ],
  );

  const icon = reference.type === 'route' ? undefined : ENTITY_ICONS[reference.type];

  const link = (
    <a
      {...{ [RENDERER_HANDLED_LINK_ATTR]: 'true' }}
      className={referenceStyles.entityLink}
      data-slot="markdown-entity-link"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      onClick={handleClick}
    >
      {icon && createElement(icon, { className: styles.icon, size: 16 })}
      {displayLabel}
    </a>
  );

  if (reference.type === 'route' || reference.workspaceSlug) return link;

  return (
    <InternalEntityPreview fallbackTitle={displayLabel} reference={reference}>
      {link}
    </InternalEntityPreview>
  );
});

InternalEntityLink.displayName = 'InternalEntityLink';
