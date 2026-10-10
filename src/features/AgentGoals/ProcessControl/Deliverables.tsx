'use client';

import { cn } from 'cn';
import { ExternalLink, FileDown, FileText, Link2 } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { isSafeExternalUrl } from '@/features/Work/descriptors';
import { useActivityTime } from '@/hooks/useActivityTime';
import { useChatStore } from '@/store/chat';

import type { GoalArtifactView, GoalGraphView } from './goalGraphViewModel';
import { KindDot } from './shared';

/**
 * What the goal produced, as things you can open.
 *
 * Findings say what the goal now believes; this says what came out of it. They
 * are deliberately separate rows: a finding is the synthesized prose, the
 * deliverable is the artifact that prose is about, and until now the artifact
 * survived only as a URL buried inside that prose.
 *
 * Only artifacts the run persisted into the product appear. Anything a task
 * left on a local path is invisible here by construction — which is what the
 * empty state says, and what the dispatched task contract asks for up front.
 *
 * Goal-level rather than per-task, because "show me the report" is a question
 * about the goal — no single task node can answer it.
 *
 * Opening one keeps you on the goal: the surrounding page already drills into a
 * node or a task run through the side Portal, and a deliverable is the same
 * kind of look. Navigating away would cost the reader the goal they were
 * reading. Only a resource that genuinely lives outside the product leaves.
 */

const styles = {
  producer: 'flex-none justify-end max-w-[40%]',
  time: 'flex-none min-w-15 text-end',
  row: 'w-full p-2 border-none rounded-(--ant-border-radius-sm) text-start bg-transparent bg-none',
  rowOpenable:
    'cursor-pointer hover:bg-[var(--ant-color-fill-quaternary)] focus-visible:[outline:2px_solid_var(--primary)] focus-visible:-outline-offset-2',
};

/**
 * Where a row actually goes, or `undefined` when it goes nowhere: an external
 * Work registered without a url, a file version missing its `fileUrl`, a
 * document whose binding never resolved. Such a row must not look clickable,
 * and a url is only a destination once it is proven http(s) — a stored value
 * can carry `javascript:` / `data:` / a custom scheme, and on desktop
 * `window.open` hands straight to `shell.openExternal`.
 */
export const openTargetOf = (artifact: GoalArtifactView) => {
  if (artifact.type === 'document' && artifact.resourceId) return { kind: 'document' } as const;
  if (isSafeExternalUrl(artifact.url)) return { kind: 'external', url: artifact.url } as const;
  return undefined;
};

const DeliverableRow = memo<{
  artifact: GoalArtifactView;
  onOpen: (artifact: GoalArtifactView) => void;
  producerTitle?: string;
}>(({ artifact, onOpen, producerTitle }) => {
  const { t } = useTranslation('chat');
  const { text, title } = useActivityTime(artifact.createdAt);
  // A document opens inside the app; a generated file downloads; an external
  // resource leaves for its own site.
  const icon =
    artifact.type === 'document' ? FileText : artifact.type === 'file' ? FileDown : ExternalLink;

  const openable = !!openTargetOf(artifact);
  // A real button carries focus, Enter/Space and the right semantics for
  // free; a row with nowhere to go stays inert rather than faking an
  // affordance it cannot honour.
  const RowTag = openable ? 'button' : 'div';

  return (
    <RowTag
      className={cn(styles.row, openable && styles.rowOpenable)}
      {...(openable ? { onClick: () => onOpen(artifact), type: 'button' as const } : {})}
    >
      {createElement(icon, { color: 'var(--ant-color-text-quaternary)', size: 14 })}
      {/* The title takes the slack so the attribution and the timestamp form
          right-aligned columns; letting the title size itself left every row's
          attribution starting at a different x. */}
      <div className="truncate min-w-0 font-medium" style={{ flex: 1, minWidth: 0 }}>
        {artifact.title || artifact.identifier || t('goalProcess.deliverables.untitled')}
      </div>
      {!!producerTitle && (
        <div className={`flex items-center gap-1.5 ${styles.producer}`}>
          <KindDot kind={'task'} />
          <div className="truncate min-w-0 text-[12px] text-muted-foreground">
            {t('goalProcess.deliverables.from', { title: producerTitle })}
          </div>
        </div>
      )}
      <div className={cn('text-[12px] text-muted-foreground', styles.time)} title={title}>
        {text}
      </div>
    </RowTag>
  );
});

DeliverableRow.displayName = 'GoalDeliverableRow';

const Deliverables = memo<{ graph: GoalGraphView }>(({ graph }) => {
  const { t } = useTranslation('chat');
  const openDocument = useChatStore((s) => s.openDocument);

  const open = (artifact: GoalArtifactView) => {
    const target = openTargetOf(artifact);
    if (!target) return;
    // `openDocument` takes the DOCUMENT id, not the agent-document binding id:
    // `agentDocumentId` only establishes that a binding exists.
    if (target.kind === 'document') {
      openDocument(artifact.resourceId!, artifact.agentDocumentId);
      return;
    }
    // A generated file and an external resource both leave for their canonical
    // target. The file-preview Portal is not a substitute: it resolves a
    // knowledge-base item, so an ordinary exported file loads forever in it.
    window.open(target.url, '_blank', 'noopener,noreferrer');
  };

  if (graph.artifacts.length === 0)
    return (
      <div className="flex items-center gap-1.5">
        <Link2 color={'var(--ant-color-text-quaternary)'} size={14} />
        <div className="text-[13px] text-muted-foreground">
          {t('goalProcess.deliverables.empty')}
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-0">
      {graph.artifacts.map((artifact) => (
        <DeliverableRow
          artifact={artifact}
          key={artifact.workVersionId}
          producerTitle={graph.byId[artifact.nodeId]?.node.title}
          onOpen={open}
        />
      ))}
    </div>
  );
});

Deliverables.displayName = 'GoalDeliverables';

export default Deliverables;
