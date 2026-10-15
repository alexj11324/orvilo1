import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import { z } from 'zod';

import type { DocumentCommentEditorValue } from './editorKit';

const commentJson = z.json();
/** JSON codec removes undefined Lexical optional fields before the single
 * untrusted-value validation boundary; PostgreSQL/tRPC require actual JSON. */
export function readNativeCommentValue(
  editor: Pick<NativeIEditorKernel, 'getDocument'>,
): DocumentCommentEditorValue {
  const content = editor.getDocument('markdown');
  if (typeof content !== 'string')
    throw new Error('Native comment Markdown datasource returned a non-string');
  const raw = editor.getDocument('json') ?? null;
  const wire = JSON.stringify(raw);
  const normalized: unknown = JSON.parse(wire);
  return { content, editorData: commentJson.parse(normalized) };
}
