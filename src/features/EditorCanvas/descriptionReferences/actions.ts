import type { IEditor, SchemaRendererProps } from '@lobehub/editor';
import { INSERT_LINK_COMMAND } from '@lobehub/editor';
import isEqual from 'fast-deep-equal';
import { $getRoot, $getSelection, $isElementNode } from 'lexical';

import {
  DESCRIPTION_REFERENCE_SCHEMA,
  parseDescriptionReference,
  validateDescriptionReferenceNode,
} from '@/libs/editor/descriptionReference';

export const insertDescriptionReference = (editor: IEditor, url: string, appOrigin: string) => {
  const reference = parseDescriptionReference(url, appOrigin);
  const lexical = editor.getLexicalEditor();
  if (!reference || !lexical?.isEditable()) return false;
  lexical.update(
    () => {
      if (!$getSelection()) $getRoot().selectEnd();
    },
    { discrete: true },
  );
  editor.dispatchCommand(INSERT_LINK_COMMAND, { title: reference.id, url: reference.url });
  return true;
};

/** setDocument hydration bypasses transforms; mark imported links for the existing rule. */
export const sanitizeDescriptionReferenceNode = (
  node: SchemaRendererProps['node'],
  appOrigin: string,
) => {
  if (node.getSchemaType() !== DESCRIPTION_REFERENCE_SCHEMA) return;
  const reference = validateDescriptionReferenceNode(node.exportJSON(), appOrigin);
  const url = reference?.url ?? '';
  const title = reference?.id ?? '';
  if (node.getURL() !== url || node.getTitle() !== title || !isEqual(node.getPayload(), reference))
    node.setURL(url).setTitle(title).setPayload(reference);
};

export const normalizeDescriptionReferenceLinks = (editor: IEditor, appOrigin: string) => {
  editor.getLexicalEditor()?.update(
    () => {
      const pending = $getRoot().getChildren();
      while (pending.length > 0) {
        const node = pending.pop()!;
        if (node.getType() === 'schema-link')
          sanitizeDescriptionReferenceNode(node as SchemaRendererProps['node'], appOrigin);
        if (node.getType() === 'link') node.markDirty();
        if ($isElementNode(node)) pending.push(...node.getChildren());
      }
    },
    { discrete: true },
  );
};
