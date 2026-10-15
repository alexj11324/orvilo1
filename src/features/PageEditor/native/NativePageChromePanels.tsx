'use client';

import type { NativeHistoryDiffProps } from '@/components/NativeHistoryDiff';
import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';

import { NativeAskCopilotSelection } from './NativeAskCopilotSelection';
import { NativeDocumentHistoryDiff } from './NativeDocumentHistoryDiff';
import { NativeHistoryPanel } from './NativeHistoryPanel';
import { NativePageCopilotPanel, NativePagePanelFrame } from './NativePageCopilotPanel';
import type { NativePageChrome, NativePageChromeState } from './NativePageEditorAssembler';

export type NativePageRichDiffAdapters = Pick<NativeHistoryDiffProps, 'widgets' | 'plugins'>;

export function NativePageRightPanel({
  state,
  richDiff,
}: {
  state: NativePageChromeState;
  richDiff: NativePageRichDiffAdapters;
}) {
  const blocked = useDocumentStore(editorSelectors.saveBlockedByLock(state.documentId));
  return state.rightPanelMode === 'history' ? (
    <NativePagePanelFrame>
      <NativeHistoryPanel
        key={state.documentId}
        renderDiff={(ids) => <NativeDocumentHistoryDiff {...richDiff} {...ids} />}
        state={state}
      />
    </NativePagePanelFrame>
  ) : (
    <NativePageCopilotPanel lockedByOther={blocked} />
  );
}

export function NativePageBodyTools({ state }: { state: NativePageChromeState }) {
  if (!state.editor || !state.editable) return null;
  return (
    <NativeAskCopilotSelection
      documentId={state.documentId}
      editor={state.editor}
      onOpenCopilot={() => state.setRightPanelMode('copilot')}
    />
  );
}

/** Bind the same actual complete widget/plugin adapters as the main document.
 * No default, empty math renderer, SDK fallback or implicit KaTeX import exists. */
export function createNativePagePanelChrome(
  richDiff: NativePageRichDiffAdapters,
): Pick<NativePageChrome, 'rightPanel' | 'bodyTools'> {
  return {
    rightPanel: (state) => <NativePageRightPanel richDiff={richDiff} state={state} />,
    bodyTools: (state) => <NativePageBodyTools state={state} />,
  };
}
