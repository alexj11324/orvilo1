'use client';

import {
  type NativeIPlugin,
  NativeVirtualBlockPlugin,
} from '@orvilo/editor-runtime/native-browser';
import type { TFunction } from 'i18next';
import type { LexicalEditor } from 'lexical';

import ActionTag from '../InputEditor/ActionTag/ActionTag';
import type { ActionTagNode } from '../InputEditor/ActionTag/ActionTagNode';
import { LocalFileTag } from '../InputEditor/LocalFileTag/LocalFileTag';
import type { LocalFileTagNode } from '../InputEditor/LocalFileTag/LocalFileTagNode';
import ReferTopic from '../InputEditor/ReferTopic/ReferTopic';
import type { ReferTopicNode } from '../InputEditor/ReferTopic/ReferTopicNode';
import { ActionTagPlugin } from './ActionTagPlugin';
import { LocalFileTagPlugin } from './LocalFileTagPlugin';
import { ReferTopicPlugin } from './ReferTopicPlugin';

/** Only these persisted command identifiers have declared editor locale keys.
 * Dynamic skill/tool identifiers keep their own supplied business label. */
function nativeActionLabel(node: ActionTagNode, t: TFunction<'editor'>): string {
  if (node.actionCategory !== 'command') return node.actionLabel;
  switch (node.actionType) {
    case 'compact': {
      return t('slash.compact');
    }
    case 'newTopic': {
      return t('slash.newTopic');
    }
    case 'goal': {
      return t('slash.goal');
    }
    default: {
      return node.actionLabel;
    }
  }
}

/** Existing node classes, shared native decorator registries and serializers;
 * only service identities come from the actual local native kernel closure. */
export function nativeChatEmbedPlugins(t: TFunction<'editor'>): NativeIPlugin[] {
  return [
    NativeVirtualBlockPlugin,
    [
      ActionTagPlugin,
      {
        decorator: (node: ActionTagNode, editor: LexicalEditor) => (
          <ActionTag editor={editor} label={nativeActionLabel(node, t)} node={node} />
        ),
      },
    ],
    [
      LocalFileTagPlugin,
      {
        decorator: (node: LocalFileTagNode, editor: LexicalEditor) => (
          <LocalFileTag
            editor={editor}
            nodeKey={node.getKey()}
            file={{
              isDirectory: node.isDirectory,
              name: node.name,
              path: node.path,
            }}
          />
        ),
      },
    ],
    [ReferTopicPlugin, { decorator: (node: ReferTopicNode) => <ReferTopic node={node} /> }],
  ];
}
