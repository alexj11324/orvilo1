import { type BuiltinRender } from '@orvilo/types';

import CreateDocumentRender from './CreateDocumentRender';

export const NotebookIdentifier = 'orvilo-notebook';

export const NotebookApiName = {
  createDocument: 'createDocument',
} as const;

export const NotebookRenders: Record<string, BuiltinRender> = {
  [NotebookApiName.createDocument]: CreateDocumentRender as BuiltinRender,
};
