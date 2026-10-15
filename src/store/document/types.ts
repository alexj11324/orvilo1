import type { EditorRuntimePort } from '@orvilo/editor-runtime';

/** Document persistence reads exported values and hydrates documents. It does
 * not require vendor DataSource classes or editor UI/plugin internals. Keep
 * the shared runtime's document-write signature unchanged. */
export type DocumentEditorPort = Pick<EditorRuntimePort, 'getDocument' | 'setDocument'>;
