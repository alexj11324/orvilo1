import { EditorRuntime } from '@orvilo/editor-runtime';

// Lightweight singleton shared by page context collection and the lazily loaded executor.
export const pageAgentRuntime = new EditorRuntime();
