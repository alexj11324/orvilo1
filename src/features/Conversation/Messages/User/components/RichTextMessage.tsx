import { LexicalRenderer } from '@lobehub/editor/renderer';
import type { SerializedEditorState } from 'lexical';
import type { CSSProperties } from 'react';
import { memo, useMemo } from 'react';

import LobeThemeScope from '@/components/LobeThemeScope';
import { ActionTagNode } from '@/features/ChatInput/InputEditor/ActionTag/ActionTagNode';
import { LocalFileTagNode } from '@/features/ChatInput/InputEditor/LocalFileTag';
import { mentionFilledClassName } from '@/features/ChatInput/InputEditor/mentionStyle';
import { ReferTopicNode } from '@/features/ChatInput/InputEditor/ReferTopic/ReferTopicNode';

interface RichTextMessageProps {
  editorState: unknown;
  /** Optional public body size in px; omitted retains the renderer variant default. */
  fontSize?: number;
  /** Optional unitless line-height ratio; omitted retains the existing 1.6. */
  lineHeight?: number;
  variant?: 'chat' | 'default';
}

const LINE_HEIGHT = 1.6;
const style: CSSProperties = { '--common-line-height': LINE_HEIGHT } as CSSProperties;
const EXTRA_NODES = [ActionTagNode, ReferTopicNode, LocalFileTagNode];

const RichTextMessage = memo<RichTextMessageProps>(
  ({ editorState, fontSize, lineHeight, variant = 'chat' }) => {
    const value = useMemo(() => {
      if (!editorState || typeof editorState !== 'object') return null;
      if (Object.keys(editorState as Record<string, unknown>).length === 0) return null;
      return editorState as SerializedEditorState;
    }, [editorState]);

    if (!value) return null;

    const renderedStyle =
      fontSize === undefined && lineHeight === undefined
        ? style
        : ({
            ...style,
            ...(fontSize === undefined ? {} : { '--common-font-size': `${fontSize}px` }),
            ...(lineHeight === undefined ? {} : { '--common-line-height': lineHeight }),
          } as CSSProperties);

    return (
      <LobeThemeScope>
        <LexicalRenderer
          className={mentionFilledClassName}
          extraNodes={EXTRA_NODES}
          style={renderedStyle}
          value={value}
          variant={variant}
        />
      </LobeThemeScope>
    );
  },
);

RichTextMessage.displayName = 'RichTextMessage';

export default RichTextMessage;
