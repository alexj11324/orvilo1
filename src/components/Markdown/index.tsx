'use client';

import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { cn } from 'cn';
import { useReducedMotion } from 'motion/react';
import {
  type ComponentProps,
  createContext,
  type CSSProperties,
  type ReactNode,
  use,
  useMemo,
} from 'react';
import {
  defaultComponents,
  defaultRemarkPlugins,
  type ExtraProps,
  Streamdown,
  type StreamdownProps,
  useIsCodeFenceIncomplete,
} from 'streamdown';

import { ChatHtmlPreview } from '@/components/HtmlPreview/ChatPreview';
import { isHtmlPreviewDocument as isFullHtmlDocument } from '@/components/HtmlPreview/document';
import { Image, PreviewGroup } from '@/components/ImagePreview';
import { Mermaid } from '@/components/Mermaid';
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
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import { citationDetail, CitationLink } from './Citation';
import { markdownComponentAdapters } from './componentAdapters';
import styles from './markdown.module.css';
import {
  type CitationItem,
  rehypeFootnoteDetails,
  remarkChatBreaks,
  remarkCitations,
  remarkFootnoteDetails,
  remarkGithubAlerts,
} from './plugins';
import { nativeRehypePipeline } from './rehype';
import {
  type StreamAnimationGranularity,
  type StreamSmoothingPreset,
  useSmoothedMarkdown,
} from './useSmoothedMarkdown';

export type { CitationItem } from './plugins';
export { allowedMarkdownTags } from './rehype';
export type { StreamAnimationGranularity, StreamSmoothingPreset } from './useSmoothedMarkdown';
export { isHtmlPreviewDocument as isFullHtmlDocument } from '@/components/HtmlPreview/document';

/** Native behavior contract; unsupported legacy options are not silently accepted. */
export interface MarkdownProps extends Omit<StreamdownProps, 'animated' | 'mermaid' | 'plugins'> {
  allowHtml?: boolean;
  animated?: boolean;
  citations?: CitationItem[];
  componentProps?: {
    a?: Partial<ComponentProps<'a'>>;
    highlight?: { theme?: string };
    html?: ComponentProps<typeof ChatHtmlPreview>['previewProps'];
    img?: Partial<ComponentProps<typeof Image>>;
    mermaid?: Partial<ComponentProps<typeof Mermaid>>;
    pre?: Partial<ComponentProps<typeof CodeBlock>>;
  };
  customRender?: (dom: ReactNode, context: { text: string }) => ReactNode;
  enableCustomFootnotes?: boolean;
  enableGithubAlert?: boolean;
  enableHtmlPreview?: boolean;
  enableImageGallery?: boolean;
  enableLatex?: boolean;
  enableMermaid?: boolean;
  enableStream?: boolean;
  fontSize?: number;
  fullFeaturedCodeBlock?: boolean;
  lineHeight?: number;
  onDoubleClick?: ComponentProps<'div'>['onDoubleClick'];
  plugins?: Omit<NonNullable<StreamdownProps['plugins']>, 'mermaid'>;
  ref?: ComponentProps<'div'>['ref'];
  rehypePluginsAhead?: StreamdownProps['rehypePlugins'];
  remarkPluginsAhead?: StreamdownProps['remarkPlugins'];
  showFootnotes?: boolean;
  streamAnimationGranularity?: StreamAnimationGranularity;
  streaming?: boolean;
  streamSmoothingPreset?: StreamSmoothingPreset;
  style?: CSSProperties;
  variant?: 'default' | 'chat';
}

const MarkdownContext = createContext<
  Pick<
    MarkdownProps,
    | 'componentProps'
    | 'citations'
    | 'showFootnotes'
    | 'enableHtmlPreview'
    | 'enableMermaid'
    | 'animated'
    | 'fullFeaturedCodeBlock'
  > & { streaming: boolean }
>({ streaming: false });
const plugins = { cjk, code, math };

// Defined outside Markdown so growing text does not remount folding/wrap controls.
function NativePre(props: ComponentProps<'pre'>) {
  const {
    streaming,
    componentProps,
    enableHtmlPreview,
    enableMermaid = true,
    animated,
    fullFeaturedCodeBlock,
  } = use(MarkdownContext);
  const incomplete = useIsCodeFenceIncomplete();
  const theme = useUserStore(userGeneralSettingsSelectors.highlighterTheme);
  const selectedTheme = componentProps?.highlight?.theme ?? theme ?? 'lobe-theme';
  const { code: source, language } = markdownCodeProps(props);
  if (language === 'mermaid' && enableMermaid)
    return (
      <Mermaid
        fullFeatured={fullFeaturedCodeBlock}
        {...componentProps?.mermaid}
        animated={animated}
      >
        {source}
      </Mermaid>
    );
  if (enableHtmlPreview && language === 'html' && isFullHtmlDocument(source)) {
    return (
      <ChatHtmlPreview
        animated={animated}
        content={source}
        previewProps={componentProps?.html}
        streaming={streaming}
      />
    );
  }
  return (
    <CodeBlock
      showLineNumbers
      className="my-3 min-w-0"
      code={source}
      language={language ?? 'text'}
      maxLines={16}
      streaming={streaming || incomplete}
      themes={{ dark: selectedTheme, light: selectedTheme }}
      {...componentProps?.pre}
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

function NativeImage({ node: _node, ref: _ref, ...props }: ComponentProps<'img'> & ExtraProps) {
  const { componentProps } = use(MarkdownContext);
  return <Image {...props} {...componentProps?.img} />;
}

function NativeLink({ node, ...props }: ComponentProps<'a'> & ExtraProps) {
  const { citations, componentProps } = use(MarkdownContext);
  const match = props.href?.match(/^citation-(\d+)$/);
  const detail = match ? citations?.[Number(match[1]) - 1] : citationDetail({ node, ...props });
  if (match || props['data-footnote-ref' as keyof typeof props]) {
    const citation = (
      <CitationLink {...props} detail={detail} href={match ? undefined : props.href}>
        {match ? match[1] : props.children}
      </CitationLink>
    );
    return match ? <sup>{citation}</sup> : citation;
  }
  return (
    <a
      {...props}
      className={cn('text-primary-text underline underline-offset-2', props.className)}
      rel={props.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      target={props.href?.startsWith('http') ? '_blank' : undefined}
      {...componentProps?.a}
    />
  );
}

// Streamdown's default strong owner is a visual span. Preserve Markdown's
// semantic importance for screen readers and persisted document rendering.
function NativeStrong({ node: _node, ...props }: ComponentProps<'strong'> & ExtraProps) {
  return <strong {...props} />;
}

function NativeSection({ node, ...props }: ComponentProps<'section'> & ExtraProps) {
  const { showFootnotes = true } = use(MarkdownContext);
  if (!showFootnotes && node?.properties.dataFootnotes !== undefined) return null;
  return <defaultComponents.section {...props} />;
}

const alertRoles = {
  NOTE: 'border-info-border bg-info-wash',
  TIP: 'border-success-border bg-success-wash',
  IMPORTANT: 'border-primary-border bg-primary-wash',
  WARNING: 'border-warning-border bg-warning-wash',
  CAUTION: 'border-destructive-border bg-destructive-wash',
};
function NativeGithubAlert({
  node,
  children,
  className,
  ...props
}: ComponentProps<'aside'> & ExtraProps) {
  const value = String(node?.properties.dataAlert ?? 'NOTE');
  const kind = Object.hasOwn(alertRoles, value) ? (value as keyof typeof alertRoles) : 'NOTE';
  return (
    <aside
      {...props}
      className={cn(
        'my-4 flex flex-col gap-2 rounded-(--radius-card) border p-4 text-sm text-foreground',
        alertRoles[kind],
        className,
      )}
    >
      <strong>{kind}</strong>
      {children}
    </aside>
  );
}

export function Markdown({
  animated = false,
  allowHtml = false,
  citations,
  componentProps,
  customRender,
  enableCustomFootnotes = false,
  enableGithubAlert = false,
  enableHtmlPreview = false,
  enableLatex = true,
  enableMermaid = true,
  fullFeaturedCodeBlock,
  rehypePlugins,
  rehypePluginsAhead,
  remarkPlugins,
  remarkPluginsAhead,
  showFootnotes = true,
  streamAnimationGranularity = 'char',
  streamSmoothingPreset = 'balanced',
  children,
  className,
  components,
  enableImageGallery = true,
  enableStream = true,
  fontSize,
  isAnimating,
  lineHeight,
  mode,
  onDoubleClick,
  ref,
  streaming = false,
  style,
  variant = 'default',
  ...props
}: MarkdownProps) {
  const reducedMotion = useReducedMotion();
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const active = isAnimating ?? streaming;
  const motionEnabled = !reducedMotion && animationMode !== 'disabled';
  const displayed = useSmoothedMarkdown(
    children ?? '',
    active && motionEnabled,
    streamAnimationGranularity,
    streamSmoothingPreset,
  );
  const renderers = useMemo(
    () =>
      markdownComponentAdapters({
        a: NativeLink,
        img: NativeImage,
        pre: NativePre,
        section: NativeSection,
        strong: NativeStrong,
        ...(enableGithubAlert ? { aside: NativeGithubAlert } : {}),
        ...components,
      }),
    [components, enableGithubAlert],
  );
  const rendered = (
    <PreviewGroup enable={enableImageGallery}>
      <div
        data-markdown-variant={variant}
        ref={ref}
        className={cn(
          styles.root,
          'min-w-0 text-foreground',
          fontSize === 12 ? 'text-xs' : 'text-sm',
          className,
        )}
        style={{
          // Supplied font sizes are user/content configuration, not a new static scale.
          ...(fontSize !== undefined && fontSize !== 12 && fontSize !== 14 && { fontSize }),
          ...(lineHeight !== undefined && { lineHeight }),
          ...style,
        }}
        onDoubleClick={onDoubleClick}
      >
        <MarkdownContext
          value={{
            streaming: active,
            componentProps,
            citations,
            showFootnotes,
            enableHtmlPreview,
            enableMermaid,
            fullFeaturedCodeBlock,
            animated: animated && motionEnabled,
          }}
        >
          <Streamdown
            {...props}
            animated={animated && motionEnabled}
            components={renderers}
            controls={props.controls ?? { code: true, table: true }}
            isAnimating={active}
            mode={mode ?? (enableStream || streaming || animated ? 'streaming' : 'static')}
            plugins={{ ...plugins, ...props.plugins, math: enableLatex ? math : undefined }}
            skipHtml={props.skipHtml ?? !allowHtml}
            rehypePlugins={nativeRehypePipeline({
              allowHtml,
              allowedTags: {
                ...props.allowedTags,
                ...(enableGithubAlert ? { aside: ['dataAlert'] } : {}),
              },
              ahead: rehypePluginsAhead,
              domain: rehypePlugins,
              after: enableCustomFootnotes ? [rehypeFootnoteDetails] : [],
            })}
            remarkPlugins={[
              ...Object.values(defaultRemarkPlugins),
              ...(remarkPluginsAhead ?? []),
              ...(enableCustomFootnotes
                ? [
                    [remarkCitations, { count: citations?.length ?? 0 }] as [
                      typeof remarkCitations,
                      { count: number },
                    ],
                    remarkFootnoteDetails,
                  ]
                : []),
              [remarkChatBreaks, { soft: variant === 'chat' }] as [
                typeof remarkChatBreaks,
                { soft: boolean },
              ],
              ...(enableGithubAlert ? [remarkGithubAlerts] : []),
              ...(remarkPlugins ?? []),
            ]}
          >
            {displayed}
          </Streamdown>
        </MarkdownContext>
      </div>
    </PreviewGroup>
  );
  return customRender ? customRender(rendered, { text: children ?? '' }) : rendered;
}

export type TypographyProps = ComponentProps<'article'> & {
  fontSize?: number;
  lineHeight?: number;
};
export function Typography({ className, fontSize, lineHeight, style, ...props }: TypographyProps) {
  return (
    <article
      {...props}
      className={cn(styles.root, 'min-w-0 text-sm text-foreground', className)}
      style={{
        ...(fontSize !== undefined && fontSize !== 14 && { fontSize }),
        ...(lineHeight !== undefined && { lineHeight }),
        ...style,
      }}
    />
  );
}

export default Markdown;
