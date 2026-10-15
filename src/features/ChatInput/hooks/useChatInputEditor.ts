import { useMemo } from 'react';

import { useChatInputStore } from '@/features/ChatInput/store';

import { activeComposer, type ComposerProtocol as IEditor } from '../composerProtocol';

export interface ChatInputEditor {
  clearContent: () => void;
  focus: () => void;
  getJSONState: () => any;
  getMarkdownContent: () => string;
  instance: IEditor;
  setDocument: (type: string, content: any, options?: Record<string, unknown>) => void;
  setExpand: (expand: boolean) => void;
  setJSONState: (content: any) => void;
}
export const useChatInputEditor = () => {
  const [editor, getMarkdownContent, getJSONState, setExpand, setJSONState, setDocument] =
    useChatInputStore((s) => [
      activeComposer(s),
      s.getMarkdownContent,
      s.getJSONState,
      s.setExpand,
      s.setJSONState,
      s.setDocument,
    ]);

  return useMemo<ChatInputEditor>(
    () => ({
      clearContent: () => {
        editor?.cleanDocument();
      },
      focus: () => {
        editor?.focus();
      },
      getJSONState,
      getMarkdownContent,
      instance: editor!,
      setDocument,
      setExpand,
      setJSONState,
    }),
    [editor],
  );
};
