import { type ComponentProps, createContext, use } from 'react';

import { ChatHtmlPreview } from '@/components/HtmlPreview/ChatPreview';
import type { HtmlPreviewOptions } from '@/components/HtmlPreview/InlinePreview';
import { isFullHtmlDocument } from '@/components/HtmlPreview/srcDoc';
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

import styles from './CodeBlock.module.css';
import { Mermaid, type MermaidProps } from './Mermaid';
import { resolveHighlighterThemes } from './themes';

export interface MarkdownCodeBlockComponentProps {
  highlight?: { theme?: string };
  html?: HtmlPreviewOptions;
  mermaid?: Partial<Omit<MermaidProps, 'children'>>;
}

export interface MarkdownCodeBlockOptions {
  animated?: boolean;
  componentProps?: MarkdownCodeBlockComponentProps;
  enableHtmlPreview?: boolean;
  enableMermaid?: boolean;
  fullFeaturedCodeBlock?: boolean;
  streaming?: boolean;
}

// A stable renderer preserves folding and scroll state while message content grows.
export const MarkdownCodeBlockContext = createContext<MarkdownCodeBlockOptions>({});

/** Fenced-code renderer: Mermaid and full HTML documents get previews, everything else a code block. */
export default function MarkdownCodeBlock(props: ComponentProps<'pre'>) {
  const {
    animated,
    componentProps,
    enableHtmlPreview,
    enableMermaid = true,
    fullFeaturedCodeBlock,
    streaming,
  } = use(MarkdownCodeBlockContext);
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

  return (
    <CodeBlock
      showLineNumbers
      className={`my-3 min-w-0 ${styles.surface}`}
      code={code}
      language={language ?? 'text'}
      maxLines={16}
      streaming={streaming}
      themes={resolveHighlighterThemes(componentProps?.highlight?.theme)}
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
