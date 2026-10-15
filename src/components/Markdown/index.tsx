'use client';

import { cjk } from '@streamdown/cjk';
import { createMathPlugin } from '@streamdown/math';
import { cn } from 'cn';
import {
  type ComponentType,
  type CSSProperties,
  type HTMLAttributes,
  memo,
  type ReactNode,
  type Ref,
  useMemo,
} from 'react';
import {
  type Components,
  defaultRehypePlugins,
  defaultRemarkPlugins,
  type PluginConfig,
  Streamdown,
  type StreamdownProps,
} from 'streamdown';

import MarkdownCodeBlock, {
  type MarkdownCodeBlockComponentProps,
  MarkdownCodeBlockContext,
} from './CodeBlock';
import {
  type CitationItem,
  MarkdownElementContext,
  markdownElements,
  ROOT_CLASS,
} from './elements';
import { preprocessLaTeX, remarkBreaks, transformCitations } from './plugins';

export type { MarkdownCodeBlockComponentProps } from './CodeBlock';
export { MarkdownCodeBlockContext } from './CodeBlock';
export { default as MarkdownCodeBlock } from './CodeBlock';
export type { CitationItem } from './elements';
export { Mermaid, type MermaidProps } from './Mermaid';
export { highlighterThemes, mermaidThemes } from './themes';

type PluggableList = NonNullable<StreamdownProps['rehypePlugins']>;

export type MarkdownComponents = Components & Record<string, ComponentType<any>>;

export interface MarkdownProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** Parse inline HTML (sanitized). Off by default: raw HTML renders as text. */
  allowHtml?: boolean;
  /** Fade newly streamed text in and parse incomplete Markdown while generating. */
  animated?: boolean;
  /** Accepted for API compatibility; surfaces use the design-system radius roles. */
  borderRadius?: number;
  children?: string;
  /** Resolve `[n]` references (with `enableCustomFootnotes`) against these sources. */
  citations?: CitationItem[];
  componentProps?: MarkdownCodeBlockComponentProps;
  /** Element overrides and custom-tag renderers, merged over the facade's defaults. */
  components?: Partial<MarkdownComponents>;
  /** Wraps the rendered tree, e.g. to swap in a preview for very long text. */
  customRender?: (dom: ReactNode, context: { text: string }) => ReactNode;
  enableCustomFootnotes?: boolean;
  enableHtmlPreview?: boolean;
  /** Accepted for API compatibility; images render inline without a gallery. */
  enableImageGallery?: boolean;
  enableLatex?: boolean;
  enableMermaid?: boolean;
  /** Allow streaming mode while `animated`; false always renders statically. */
  enableStream?: boolean;
  fontSize?: number;
  fullFeaturedCodeBlock?: boolean;
  headerMultiple?: number;
  lineHeight?: number;
  marginMultiple?: number;
  ref?: Ref<HTMLElement>;
  rehypePlugins?: PluggableList;
  rehypePluginsAhead?: PluggableList;
  remarkPlugins?: PluggableList;
  remarkPluginsAhead?: PluggableList;
  showFootnotes?: boolean;
  /** Actual generation state, independent of the optional fade-in animation. */
  streaming?: boolean;
  style?: CSSProperties;
  /** `chat` uses compact rhythm and treats single newlines as line breaks. */
  variant?: 'chat' | 'default';
}

const mathPlugin = createMathPlugin({ singleDollarTextMath: true });
const basePlugins: PluginConfig = { cjk };
const latexPlugins: PluginConfig = { cjk, math: mathPlugin };
const baseRemarkPlugins = Object.values(defaultRemarkPlugins);
// Sanitized raw HTML, without rehype-harden: it blocks relative links such as
// in-app routes and citation anchors.
const htmlRehypePlugins = [defaultRehypePlugins.raw, defaultRehypePlugins.sanitize];
const disabledControls = { code: false, image: false, mermaid: false, table: false } as const;
const disabledLinkSafety = { enabled: false };

/**
 * Local Markdown renderer backed by streamdown. Typography is applied per
 * element (see `elements.tsx`), so components embedded in a message keep
 * their own styles.
 */
export const Markdown = memo<MarkdownProps>(
  ({
    allowHtml,
    animated,
    borderRadius: _borderRadius,
    children = '',
    citations,
    className,
    componentProps,
    components,
    customRender,
    enableCustomFootnotes,
    enableHtmlPreview = false,
    enableImageGallery: _enableImageGallery,
    enableLatex = true,
    enableMermaid = true,
    enableStream = true,
    fontSize,
    fullFeaturedCodeBlock,
    headerMultiple,
    lineHeight,
    marginMultiple,
    rehypePlugins,
    rehypePluginsAhead,
    remarkPlugins,
    remarkPluginsAhead,
    showFootnotes = true,
    streaming,
    style,
    variant = 'default',
    ...rest
  }) => {
    const isChat = variant === 'chat';
    const isStreaming = !!animated && enableStream;

    const content = useMemo(() => {
      let text = children;
      if (enableLatex) text = preprocessLaTeX(text);
      if (enableCustomFootnotes) text = transformCitations(text, citations?.length);
      return text;
    }, [children, citations?.length, enableCustomFootnotes, enableLatex]);

    const remark = useMemo<PluggableList>(
      () => [
        ...(remarkPluginsAhead ?? []),
        ...baseRemarkPlugins,
        ...(isChat ? [remarkBreaks] : []),
        ...(remarkPlugins ?? []),
      ],
      [isChat, remarkPlugins, remarkPluginsAhead],
    );

    const rehype = useMemo<PluggableList>(
      () => [
        ...(rehypePluginsAhead ?? []),
        ...(allowHtml ? htmlRehypePlugins : []),
        ...(rehypePlugins ?? []),
      ],
      [allowHtml, rehypePlugins, rehypePluginsAhead],
    );

    const renderers = useMemo(
      () => ({ ...markdownElements, pre: MarkdownCodeBlock, ...components }) as Components,
      [components],
    );

    const codeBlockOptions = useMemo(
      () => ({
        animated,
        componentProps,
        enableHtmlPreview,
        enableMermaid,
        fullFeaturedCodeBlock,
        streaming,
      }),
      [
        animated,
        componentProps,
        enableHtmlPreview,
        enableMermaid,
        fullFeaturedCodeBlock,
        streaming,
      ],
    );
    const elementOptions = useMemo(
      () => ({ citations, showFootnotes }),
      [citations, showFootnotes],
    );

    const dom = (
      <Streamdown
        animated={isStreaming}
        className="space-y-0"
        components={renderers}
        controls={disabledControls}
        isAnimating={isStreaming}
        linkSafety={disabledLinkSafety}
        mode={isStreaming ? 'streaming' : 'static'}
        parseIncompleteMarkdown={isStreaming}
        plugins={enableLatex ? latexPlugins : basePlugins}
        rehypePlugins={rehype}
        remarkPlugins={remark}
      >
        {content}
      </Streamdown>
    );

    return (
      <article
        className={cn(ROOT_CLASS, className)}
        data-markdown={variant}
        style={
          {
            '--md-font-size': `${fontSize ?? (isChat ? 14 : 16)}px`,
            '--md-header-multiple': headerMultiple ?? (isChat ? 0.25 : 1),
            '--md-line-height': lineHeight ?? (isChat ? 1.6 : 1.8),
            '--md-margin-multiple': marginMultiple ?? (isChat ? 1 : 2),
            ...style,
          } as CSSProperties
        }
        {...rest}
      >
        <MarkdownCodeBlockContext value={codeBlockOptions}>
          <MarkdownElementContext value={elementOptions}>
            {customRender ? customRender(dom, { text: children }) : dom}
          </MarkdownElementContext>
        </MarkdownCodeBlockContext>
      </article>
    );
  },
);

Markdown.displayName = 'Markdown';

export default Markdown;
