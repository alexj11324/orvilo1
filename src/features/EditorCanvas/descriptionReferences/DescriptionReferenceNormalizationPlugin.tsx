import type { SchemaRendererProps } from '@lobehub/editor';
import {
  ILinkService,
  normalizeSchemaLinkNode,
  useLexicalComposerContext,
  useLexicalEditor,
} from '@lobehub/editor';
import type { Klass } from 'lexical';
import { $getSelection, $isRangeSelection } from 'lexical';
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
        const schema = node as SchemaRendererProps['node'];
        if (schema.getSchemaType() === DESCRIPTION_REFERENCE_SCHEMA)
          return <DescriptionReferenceChip referenceNode={schema.exportJSON()} />;
        return typeof previous === 'function'
          ? previous(node, lexical)
          : previous?.render(node, lexical);
      });
      const unregister = schemaClass.current
        ? editor.registerNodeTransform(schemaClass.current, (node) =>
            sanitizeDescriptionReferenceNode(node, appOrigin),
          )
        : undefined;
      const service = kernel.requireService(ILinkService);
      const unregisterLink =
        linkClass.current && service
          ? editor.registerNodeTransform(linkClass.current, (node) => {
              if (!parseDescriptionReference(node.getURL(), appOrigin)) return;
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
              normalizeSchemaLinkNode(node, editor, service);
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
