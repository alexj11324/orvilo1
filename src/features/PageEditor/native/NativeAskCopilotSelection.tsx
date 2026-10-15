'use client';

import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import type { ChatContextContent } from '@orvilo/types';
import { nanoid } from '@orvilo/utils';
import debug from 'debug';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { requestComposerFocus } from '@/features/Conversation/composerFocus';
import {
  getRangeFirstLineRect,
  getSelectionToolbarPosition,
} from '@/features/Conversation/Messages/components/TextSelectionActionLayer/helpers';
import { useConversationStore, useConversationStoreApi } from '@/features/Conversation/store';
import type { ComposerTarget } from '@/features/Conversation/types';
import { usePermission } from '@/hooks/usePermission';
import { useFileStore } from '@/store/file';

import { usePageAgentPanelControl } from '../RightPanel/OverrideContext';
import { captureNativeSelectionContext } from './nativeSelectionContext';

const log = debug('orvilo:page:native:selection');

/** Mount under the SAME existing PageAgentProvider as NativePageCopilotPanel.
 * Host owns panel-mode layout; this capability owns selection serialization,
 * context insertion, visibility, cleanup and exact-conversation composer focus. */
export function NativeAskCopilotSelection({
  editor,
  documentId,
  onOpenCopilot,
  composerTarget,
}: {
  editor: NativeIEditorKernel;
  documentId: string;
  onOpenCopilot: () => void;
  composerTarget?: ComposerTarget;
}) {
  const { t } = useTranslation(['common', 'editor']);
  const { allowed } = usePermission('edit_own_content');
  const providerTarget = useConversationStore((s) => s.composerTarget);
  const target = composerTarget ?? providerTarget;
  const store = useConversationStoreApi();
  const { toggle } = usePageAgentPanelControl();
  const toolbar = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{
    owner: NativeIEditorKernel;
    content: ChatContextContent;
    left: number;
    top: number;
  }>();
  const [focusContext, setFocusContext] = useState<string>();
  useEffect(() => {
    if (!focusContext) return;
    if (!target.writable || target.contextKey !== focusContext) {
      setFocusContext(undefined);
      return;
    }
    return requestComposerFocus(focusContext, () => setFocusContext(undefined));
  }, [focusContext, target]);
  useEffect(() => {
    setSelection(undefined);
    const lexical = editor.getLexicalEditor();
    const root = lexical?.getRootElement();
    if (!allowed || !lexical || !root || !target.writable) {
      setSelection(undefined);
      return;
    }
    const doc = root.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;
    let frame: number | undefined;
    const update = () => {
      if (toolbar.current?.contains(doc.activeElement)) return;
      const range = doc.getSelection();
      if (
        !range ||
        range.isCollapsed ||
        range.rangeCount === 0 ||
        !range.anchorNode ||
        !range.focusNode ||
        !root.contains(range.anchorNode) ||
        !root.contains(range.focusNode)
      ) {
        setSelection(undefined);
        return;
      }
      const rect = getRangeFirstLineRect(range.getRangeAt(0));
      if (!rect) {
        setSelection(undefined);
        return;
      }
      try {
        const content = captureNativeSelectionContext({
          editor,
          documentId,
          id: `selection-${nanoid(6)}`,
          title: t('nativeCopilot.selectionTitle', { ns: 'editor' }),
        });
        if (!content) {
          setSelection(undefined);
          return;
        }
        setSelection({
          owner: editor,
          content,
          ...getSelectionToolbarPosition(rect, view.innerWidth),
        });
      } catch {
        log('selection capture failed for document %s', documentId);
        setSelection(undefined);
      }
    };
    const schedule = () => {
      if (frame !== undefined) view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(() => {
        frame = undefined;
        update();
      });
    };
    const unregister = lexical.registerUpdateListener(schedule);
    doc.addEventListener('selectionchange', schedule);
    view.addEventListener('scroll', schedule, true);
    view.addEventListener('resize', schedule);
    schedule();
    return () => {
      unregister();
      doc.removeEventListener('selectionchange', schedule);
      view.removeEventListener('scroll', schedule, true);
      view.removeEventListener('resize', schedule);
      if (frame !== undefined) view.cancelAnimationFrame(frame);
    };
  }, [allowed, documentId, editor, t, target]);
  const root = editor.getLexicalEditor()?.getRootElement();
  if (
    !allowed ||
    !selection ||
    selection.owner !== editor ||
    selection.content.pageId !== documentId ||
    !target.writable ||
    !root
  )
    return null;
  return createPortal(
    <div
      className="fixed z-50 -translate-x-1/2 -translate-y-full rounded-(--radius-overlay) border border-divider bg-popover p-1 shadow-(--shadow-raised)"
      ref={toolbar}
      style={{ left: selection.left, top: selection.top }}
    >
      <Button
        className="gap-2 text-foreground-description"
        size="compact"
        type="button"
        variant="ghost"
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          const currentTarget = composerTarget ?? store.getState().composerTarget;
          if (!currentTarget.writable || currentTarget.contextKey !== target.contextKey) return;
          const current = useFileStore.getState();
          const duplicate = (
            current.chatContextSelectionsByContext[currentTarget.contextKey] ?? []
          ).some(
            (item) =>
              item.pageId === documentId &&
              item.format === selection.content.format &&
              item.content === selection.content.content,
          );
          if (!duplicate)
            current.addChatContextSelection({
              contextKey: currentTarget.contextKey,
              selection: selection.content,
            });
          try {
            onOpenCopilot();
            toggle(true);
            setFocusContext(currentTarget.contextKey);
            setSelection(undefined);
            editor.blur();
          } catch {
            toast.error(t('nativeCopilot.openFailed', { ns: 'editor' }));
          }
        }}
      >
        <AgentRuntimeIcon size={16} type="orvilo" />
        {t('cmdk.askOrviloAI')}
      </Button>
    </div>,
    root.ownerDocument.body,
  );
}
