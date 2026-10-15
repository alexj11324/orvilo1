'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { NativeProfessionalCodeWidget } from '@/components/NativePageEditor/code';
import { NativeLinkEditor } from '@/components/NativePageEditor/linkEditor';
import {
  NativeDefaultIframe,
  NativeDefaultSchema,
  type NativeIframeRendererProps,
  NativeLinkCardWidget,
  NativeLinkIframeWidget,
  NativeLinkSchemaWidget,
  NativeMentionWidget,
} from '@/components/NativePageEditor/linkMention';
import { type NativeMathRenderer, NativeMathWidget } from '@/components/NativePageEditor/math';
import {
  NativeMentionMenu,
  type NativeMentionOptions,
} from '@/components/NativePageEditor/mentions';
import type { NativeEditorWidgets } from '@/components/NativePageEditor/session';
import { NativePageSlashMenu } from '@/components/NativePageEditor/slashMenu';
import { useNativeWorkspaceMentions } from '@/components/NativePageEditor/useWorkspaceMentions';
import { pageAgentRuntime } from '@/store/tool/slices/builtin/executors/pageAgentRuntime';

import { NativePageCreate, NativePageHeader, NativePageTitle } from './chrome/primaryChrome';
import { NativeAskCopilotSelection } from './NativeAskCopilotSelection';
import { NativeCompletePageLayout } from './NativeCompletePageLayout';
import { createNativePagePanelChrome } from './NativePageChromePanels';
import {
  type NativePageChromeState,
  NativePageEditorAssembler,
  type NativePageEditorAssemblerProps,
  type NativePageEditorPublicProps,
} from './NativePageEditorAssembler';
import { withNativeRichFeedback } from './NativePageRichFeedbackChrome';

type DocumentOptions = Omit<
  NativePageEditorAssemblerProps['document'],
  'widgets' | 'runtime' | 'label'
>;
export interface NativeCompletePageEditorProps extends NativePageEditorPublicProps {
  documentOptions?: DocumentOptions;
  getPopupContainer?: (root: HTMLElement) => HTMLElement;
  label?: string;
  /** Mandatory professional implementation plus its actual local CSS/fonts.
   * No implicit KaTeX import or unapproved package dependency. */
  mathRenderer: NativeMathRenderer;
  mentionOptions?: NativeMentionOptions;
  renderIframe?: (props: NativeIframeRendererProps) => ReactNode;
  renderSchema?: (props: NativeIframeRendererProps) => ReactNode;
}
/** Full business assembly, explicitly opt-in. Do not mount alongside legacy
 * PageEditor/StoreUpdater using the same singleton Runtime. The existing tool
 * executor consumes this exact singleton, not an unreachable isolated Runtime. */
export function NativeCompletePageEditor({
  mathRenderer,
  documentOptions,
  label,
  mentionOptions,
  getPopupContainer,
  renderIframe,
  renderSchema,
  ...publicProps
}: NativeCompletePageEditorProps) {
  const { t } = useTranslation('file');
  const widgets: NativeEditorWidgets = {
    code: (widget) => <NativeProfessionalCodeWidget {...widget} />,
    math: (widget) => <NativeMathWidget {...widget} renderer={mathRenderer} />,
    mention: (widget) => <NativeMentionWidget {...widget} />,
    linkCard: (widget) => <NativeLinkCardWidget {...widget} />,
    linkIframe: (widget) => (
      <NativeLinkIframeWidget
        {...widget}
        render={renderIframe ?? ((item) => <NativeDefaultIframe {...item} />)}
      />
    ),
    linkSchema: (widget) => (
      <NativeLinkSchemaWidget
        {...widget}
        render={renderSchema ?? ((item) => <NativeDefaultSchema {...item} />)}
      />
    ),
  };
  const panels = createNativePagePanelChrome({ widgets, plugins: documentOptions?.plugins });
  const chrome = withNativeRichFeedback(
    {
      ...panels,
      header: (state) => <NativePageHeader state={state} />,
      titleAndEmoji: (state) => <NativePageTitle state={state} />,
      create: (state) => <NativePageCreate state={state} />,
      bodyTools: (state) => (
        <CompleteBodyTools
          getPopupContainer={getPopupContainer}
          options={mentionOptions}
          state={state}
        />
      ),
    },
    widgets,
  );
  return (
    <NativePageEditorAssembler
      {...publicProps}
      chrome={chrome}
      contentLayout={(content, state) => (
        <NativeCompletePageLayout state={state}>{content}</NativeCompletePageLayout>
      )}
      document={{
        ...documentOptions,
        label: label ?? t('pageEditor.editorPlaceholder'),
        widgets,
        runtime: pageAgentRuntime,
      }}
    />
  );
}
function CompleteBodyTools({
  state,
  options,
  getPopupContainer,
}: {
  state: NativePageChromeState;
  options?: NativeMentionOptions;
  getPopupContainer?: (root: HTMLElement) => HTMLElement;
}) {
  const workspaceMentions = useNativeWorkspaceMentions(Boolean(state.page?.workspaceId));
  if (!state.editor) return null;
  return (
    <>
      <NativeMentionMenu
        getPopupContainer={getPopupContainer}
        kernel={state.editor}
        options={options ?? workspaceMentions}
      />
      <NativeLinkEditor kernel={state.editor} />
      <NativePageSlashMenu getPopupContainer={getPopupContainer} kernel={state.editor} />
      {state.editable ? (
        <NativeAskCopilotSelection
          composerTarget={state.askCopilotTarget}
          documentId={state.documentId}
          editor={state.editor}
          onOpenCopilot={() => state.setRightPanelMode('copilot')}
        />
      ) : null}
    </>
  );
}
