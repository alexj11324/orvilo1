import { isFullHtmlDocument, type MarkdownProps, Mermaid } from '@lobehub/ui';
import { createStaticStyles, cx } from 'antd-style';
import { type ComponentProps, createContext, use } from 'react';

import { ChatHtmlPreview } from '@/components/HtmlPreview/ChatPreview';
import {
  CodeBlock,
  CodeBlockCopyButton,
  CodeBlockDownloadButton,
  CodeBlockExpandButton,
  CodeBlockHeader,
  CodeBlockLanguage,
  CodeBlockWrapToggle,
  markdownCodeProps,
} from '@/components/ui/code-block';

const styles = createStaticStyles(({ css }) => ({
  surface: css`
    /* ReUI's viewport owns scrolling. A second scrollport on pre moves the
       sticky gutter over the text; Markdown's pre typography also leaks here. */
    pre {
      overflow: visible;
      margin: 0;
      font-size: var(--code-block-font-size);
      line-height: var(--code-block-line-height);
    }
  `,
}));

interface CodeBlockOptions {
  animated?: boolean;
  componentProps?: MarkdownProps['componentProps'];
  enableHtmlPreview?: boolean;
  enableMermaid?: boolean;
  fullFeaturedCodeBlock?: boolean;
  streaming?: boolean;
}

// A stable renderer preserves folding and scroll state while message content grows.
export const ChatCodeBlockContext = createContext<CodeBlockOptions>({});

export default function ChatCodeBlock(props: ComponentProps<'pre'>) {
  const {
    animated,
    componentProps,
    enableHtmlPreview,
    enableMermaid = true,
    fullFeaturedCodeBlock,
    streaming,
  } = use(ChatCodeBlockContext);
  const { code, language } = markdownCodeProps(props);

  // These fences are interactive previews, not ordinary source-code surfaces.
  if (enableMermaid && language === 'mermaid') {
    return (
      <Mermaid
        animated={animated}
        fullFeatured={fullFeaturedCodeBlock}
        {...componentProps?.mermaid}
      >
        {code}
      </Mermaid>
    );
  }
  if (enableHtmlPreview && language === 'html' && isFullHtmlDocument(code)) {
    return (
      <ChatHtmlPreview animated={animated} content={code} previewProps={componentProps?.html} />
    );
  }

  const theme = componentProps?.highlight?.theme;
  return (
    <CodeBlock
      showLineNumbers
      className={cx('my-3 min-w-0', styles.surface)}
      code={code}
      language={language ?? 'text'}
      maxLines={16}
      streaming={streaming}
      themes={theme && theme !== 'lobe-theme' ? { dark: theme, light: theme } : undefined}
    >
      <CodeBlockHeader>
        <CodeBlockLanguage />
        <div className="ml-auto flex items-center gap-1">
          <CodeBlockWrapToggle />
          <CodeBlockCopyButton />
          <CodeBlockDownloadButton />
        </div>
      </CodeBlockHeader>
      <CodeBlockExpandButton />
    </CodeBlock>
  );
}
