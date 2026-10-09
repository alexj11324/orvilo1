import { type MarkdownProps } from '@lobehub/ui';
import { Markdown } from '@lobehub/ui';
import { memo, useMemo } from 'react';

import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import ChatCodeBlock, { ChatCodeBlockContext } from './CodeBlock';

export interface MarkdownMessageProps extends MarkdownProps {
  /** Actual generation state, independent of the optional text fade-in animation. */
  streaming?: boolean;
}

const MarkdownMessage = memo<MarkdownMessageProps>(
  ({ children, componentProps, components, streaming, ...rest }) => {
    const { highlighterTheme, mermaidTheme, fontSize } = useUserStore(
      userGeneralSettingsSelectors.config,
    );
    const resolvedComponentProps = {
      ...componentProps,
      highlight: { theme: highlighterTheme, ...componentProps?.highlight },
      mermaid: { fullFeatured: false, theme: mermaidTheme, ...componentProps?.mermaid },
    };
    const renderers = useMemo(() => ({ pre: ChatCodeBlock, ...components }), [components]);

    return (
      <ChatCodeBlockContext
        value={{
          animated: rest.animated,
          componentProps: resolvedComponentProps,
          enableHtmlPreview: rest.enableHtmlPreview,
          enableMermaid: rest.enableMermaid,
          fullFeaturedCodeBlock: rest.fullFeaturedCodeBlock,
          streaming,
        }}
      >
        <Markdown
          fontSize={fontSize}
          marginMultiple={2}
          variant="chat"
          {...rest}
          componentProps={resolvedComponentProps}
          components={renderers}
        >
          {children}
        </Markdown>
      </ChatCodeBlockContext>
    );
  },
);

export default MarkdownMessage;
