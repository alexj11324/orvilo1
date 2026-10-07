import type { normalizeSchemaLinkNode, SchemaRendererProps } from '@lobehub/editor';
import { Kernel, useLexicalComposerContext, useLexicalEditor } from '@lobehub/editor';
import type { Klass } from 'lexical';
import { $applyNodeReplacement, $getSelection, $isRangeSelection } from 'lexical';
import { useLayoutEffect, useRef } from 'react';

import {
  DESCRIPTION_REFERENCE_SCHEMA,
  parseDescriptionReference,
} from '@/libs/editor/descriptionReference';

import { sanitizeDescriptionReferenceNode } from './actions';
import { DescriptionReferenceChip } from './DescriptionReferenceChip';

/** Keep clipboard/HTML-created schema nodes safe before they reach persistence or toolbars. */
export const DescriptionReferenceNormalizationPlugin = ({ appOrigin }: { appOrigin: string }) => {
  const [kernel] = useLexicalComposerContext();
  if (!(kernel instanceof Kernel))
    throw new Error('Description references require an editor kernel');
  const schemaClass = useRef<Klass<SchemaRendererProps['node']> | null>(null);
  const linkClass = useRef<Klass<Parameters<typeof normalizeSchemaLinkNode>[0]> | null>(null);
  useLayoutEffect(
    () =>
      kernel.registerNodeTransform((config) => {
        const klass = typeof config === 'function' ? config : config.replace;
        if (klass.getType() === 'schema-link')
          schemaClass.current = klass as Klass<SchemaRendererProps['node']>;
        if (klass.getType() === 'link')
          linkClass.current = klass as Klass<Parameters<typeof normalizeSchemaLinkNode>[0]>;
        return config;
      }),
    [kernel],
  );
  useLexicalEditor(
    (editor) => {
      const previous = kernel.getDecorator('schema-link');
      // Snapshot during Lexical decoration; the installed SchemaLink reads node getters
      // later during React render, outside the editor state scope.
      kernel.registerDecorator('schema-link', (node, lexical) => {
        if (
          schemaClass.current &&
          node instanceof schemaClass.current &&
          node.getSchemaType() === DESCRIPTION_REFERENCE_SCHEMA
        )
          return <DescriptionReferenceChip referenceNode={node.exportJSON()} />;
        return typeof previous === 'function'
          ? previous(node, lexical)
          : previous?.render(node, lexical);
      });
      const unregister = schemaClass.current
        ? editor.registerNodeTransform(schemaClass.current, (node) =>
            sanitizeDescriptionReferenceNode(node, appOrigin),
          )
        : undefined;
      const SchemaNode = schemaClass.current;
      const unregisterLink =
        linkClass.current && SchemaNode
          ? editor.registerNodeTransform(linkClass.current, (node) => {
              const reference = parseDescriptionReference(node.getURL(), appOrigin);
              if (!reference) return;
              const selection = $getSelection();
              // The installed normalizer removes selected link text. Move the caret
              // to its parent before replacement so Lexical can commit the chip.
              if (
                $isRangeSelection(selection) &&
                (selection.anchor.key === node.getKey() ||
                  selection.focus.key === node.getKey() ||
                  node.isParentOf(selection.anchor.getNode()) ||
                  node.isParentOf(selection.focus.getNode()))
              )
                node.selectNext();
              node.replace(
                $applyNodeReplacement(
                  new SchemaNode(
                    reference.url,
                    DESCRIPTION_REFERENCE_SCHEMA,
                    reference,
                    reference.id,
                  ),
                ),
              );
            })
          : undefined;
      return () => {
        unregister?.();
        unregisterLink?.();
        if (previous) kernel.registerDecorator('schema-link', previous);
      };
    },
    [appOrigin],
  );
  return null;
};
