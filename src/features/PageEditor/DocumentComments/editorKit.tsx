'use client';

import type { DocumentCommentJson } from '@orvilo/types';
import {
  type ComponentType,
  createContext,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
  use,
  useImperativeHandle,
} from 'react';

import type { ExistingEditorAttachment } from '@/features/EditorCanvas/editorAttachmentTransfer';

export interface DocumentCommentEditorValue {
  content: string;
  editorData: DocumentCommentJson;
}
export interface DocumentCommentEditorRef {
  clean: () => void;
  focus: () => void;
  getValue: () => DocumentCommentEditorValue;
  setValue: (value: DocumentCommentEditorValue) => void;
}
export interface CommentEditorViewProps {
  autoFocus?: boolean;
  compact?: boolean;
  disabled?: boolean;
  entityId: string;
  getPopupContainer?: () => HTMLElement | null;
  initialContent: string;
  initialEditorData?: DocumentCommentJson | null;
  onChange?: (value: DocumentCommentEditorValue) => void;
  onPressEnter?: (event: KeyboardEvent) => boolean | void;
  placeholder: string;
}
export interface CommentEditorHandle {
  cleanDocument: () => void;
  focus: () => void;
  getValue: () => DocumentCommentEditorValue;
  insertExisting: (attachments: ExistingEditorAttachment[]) => void;
  insertFiles: (files: File[]) => void;
  renderEditor: (props: CommentEditorViewProps) => ReactNode;
  renderFormattingToolbar: () => ReactNode;
  setValue: (value: DocumentCommentEditorValue) => void;
}
export interface CommentInputProps {
  children: ReactNode;
  className?: string;
  flex?: number;
  footer?: ReactNode;
  header?: ReactNode;
  maxHeight?: number;
  minHeight?: number;
  onBodyClick?: () => void;
  resize?: boolean;
  slashMenuRef?: RefObject<HTMLDivElement | null>;
}
export interface CommentActionBarProps {
  left?: ReactNode;
  right?: ReactNode;
  style?: CSSProperties;
}
export interface CommentPublishedContentProps {
  content: string;
  editorData?: DocumentCommentJson | null;
}
export interface DocumentCommentEditorKit {
  ActionBar: ComponentType<CommentActionBarProps>;
  Input: ComponentType<CommentInputProps>;
  PublishedContent: ComponentType<CommentPublishedContentProps>;
  useEditor: () => CommentEditorHandle;
}
const EditorKitContext = createContext<DocumentCommentEditorKit | null>(null);
export function DocumentCommentEditorKitProvider({
  kit,
  children,
}: {
  kit: DocumentCommentEditorKit;
  children: ReactNode;
}) {
  return <EditorKitContext value={kit}>{children}</EditorKitContext>;
}
function useKit() {
  const kit = use(EditorKitContext);
  if (!kit) throw new Error('Document comments require their explicitly mounted editor kit');
  return kit;
}
export function useDocumentCommentEditor() {
  const useEditor = useKit().useEditor;
  return useEditor();
}
export function CommentInput(props: CommentInputProps) {
  const Input = useKit().Input;
  return <Input {...props} />;
}
export function CommentInputActionBar(props: CommentActionBarProps) {
  const ActionBar = useKit().ActionBar;
  return <ActionBar {...props} />;
}
export function CommentFormattingToolbar({ editor }: { editor: CommentEditorHandle }) {
  return editor.renderFormattingToolbar();
}
export function CommentEditorView({
  editor,
  ref,
  ...props
}: CommentEditorViewProps & { editor: CommentEditorHandle; ref?: Ref<DocumentCommentEditorRef> }) {
  useImperativeHandle(
    ref,
    () => ({
      clean: editor.cleanDocument,
      focus: editor.focus,
      getValue: editor.getValue,
      setValue: editor.setValue,
    }),
    [editor],
  );
  return editor.renderEditor(props);
}

export function CommentPublishedContent(props: CommentPublishedContentProps) {
  const Renderer = useKit().PublishedContent;
  return <Renderer {...props} />;
}
