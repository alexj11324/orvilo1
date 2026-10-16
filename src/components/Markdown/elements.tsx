import { cn } from 'cn';
import { type ComponentProps, createContext, type ElementType, type JSX, use } from 'react';
import type { ExtraProps } from 'streamdown';

import { CITATION_HREF_PREFIX } from './plugins';

/**
 * Typography lives on the elements the Markdown pipeline produces, never on
 * descendant selectors from the root. Tool, permission and other components a
 * message embeds therefore keep their own styles: a nested `<hr>` or `<p>`
 * rendered by those components receives none of these classes.
 *
 * Sizes and rhythm read custom properties set on the Markdown root:
 * `--md-font-size`, `--md-line-height`, `--md-header-multiple` and
 * `--md-margin-multiple`.
 */
export const ROOT_CLASS = cn(
  'relative w-full max-w-full px-px wrap-break-word',
  'text-(length:--md-font-size) leading-(--md-line-height)',
  '[--md-block-gap:calc(var(--md-margin-multiple)*0.5em)]',
  '[--md-item-gap:calc(var(--md-margin-multiple)*0.33em)]',
);

export interface CitationItem {
  alt?: string;
  summary?: string;
  title?: string;
  url: string;
}

export interface MarkdownElementOptions {
  citations?: CitationItem[];
  showFootnotes?: boolean;
}

export const MarkdownElementContext = createContext<MarkdownElementOptions>({});

type Props<K extends keyof JSX.IntrinsicElements> = ComponentProps<K> & ExtraProps;

const heading = (Tag: ElementType, size: string) => {
  const Heading = ({ className, node: _node, ...props }: Props<'h1'>) => (
    <Tag
      className={cn(
        'my-[max(calc(var(--md-header-multiple)*var(--md-margin-multiple)*0.4em),var(--md-font-size))] font-bold leading-tight first:mt-0 last:mb-0',
        size,
        className,
      )}
      {...props}
    />
  );
  Heading.displayName = `Markdown.${String(Tag)}`;
  return Heading;
};

const Paragraph = ({ className, node: _node, ...props }: Props<'p'>) => (
  <p
    className={cn('my-1 not-first:mt-(--md-block-gap) not-last:mb-(--md-block-gap)', className)}
    {...props}
  />
);

const UnorderedList = ({ className, node: _node, ...props }: Props<'ul'>) => (
  <ul
    className={cn(
      'my-(--md-block-gap) list-outside list-disc ps-6 marker:text-muted-foreground [li>&]:my-0',
      className?.includes('contains-task-list') && 'list-none ps-1',
      className,
    )}
    {...props}
  />
);

const OrderedList = ({ className, node: _node, ...props }: Props<'ol'>) => (
  <ol
    className={cn(
      'my-(--md-block-gap) list-outside list-decimal ps-6 marker:text-muted-foreground [li>&]:my-0',
      className,
    )}
    {...props}
  />
);

const ListItem = ({ className, node: _node, ...props }: Props<'li'>) => (
  <li
    className={cn(
      'my-(--md-item-gap) [&>p:first-child]:inline',
      className?.includes('task-list-item') && 'list-none [&>input]:me-2 [&>input]:align-middle',
      className,
    )}
    {...props}
  />
);

const Blockquote = ({ className, node: _node, ...props }: Props<'blockquote'>) => (
  <blockquote
    className={cn(
      'my-(--md-block-gap) border-s-4 border-border px-4 text-muted-foreground',
      className,
    )}
    {...props}
  />
);

const Rule = ({ className, node: _node, ...props }: Props<'hr'>) => (
  <hr
    className={cn(
      'my-[calc(var(--md-margin-multiple)*1.5em)] w-full border-0 border-t border-dashed border-border',
      className,
    )}
    {...props}
  />
);

const InlineCode = ({ className, node: _node, ...props }: Props<'code'>) => (
  <code
    className={cn(
      'mx-[0.25em] rounded-(--radius-chip) border border-divider bg-muted px-[0.4em] py-[0.1em] font-mono text-[0.875em] leading-none wrap-break-word whitespace-break-spaces',
      className,
    )}
    {...props}
  />
);

// Streamdown renders `**text**` as a styled <span>; keep the semantic element.
const Strong = ({ className, node: _node, ...props }: Props<'strong'>) => (
  <strong className={cn('font-semibold', className)} {...props} />
);

const Link = ({ className, href, node: _node, children, ...props }: Props<'a'>) => {
  const { citations } = use(MarkdownElementContext);

  if (href?.startsWith(CITATION_HREF_PREFIX)) {
    const index = Number(href.slice(CITATION_HREF_PREFIX.length));
    const citation = citations?.[index - 1];
    if (citation?.url) {
      return (
        <a
          className="mx-0.5 inline-flex min-w-4 items-center justify-center rounded-(--radius-chip) bg-fill-quaternary px-1 align-super text-[0.75em] leading-none text-muted-foreground no-underline hover:bg-accent hover:text-foreground"
          data-citation={index}
          href={citation.url}
          rel="noopener noreferrer"
          target="_blank"
          title={citation.title || citation.url}
        >
          {index}
        </a>
      );
    }
    return <sup className="text-muted-foreground">{index}</sup>;
  }

  const external = !!href && /^[a-z][\d+.a-z-]*:/i.test(href) && !href.startsWith('#');
  return (
    <a
      className={cn('text-info-text underline-offset-2 hover:underline', className)}
      href={href}
      rel={external ? 'noopener noreferrer' : undefined}
      target={external ? '_blank' : undefined}
      {...props}
    >
      {children}
    </a>
  );
};

const Section = ({ className, node: _node, ...props }: Props<'section'>) => {
  const { showFootnotes = true } = use(MarkdownElementContext);
  const isFootnotes = 'data-footnotes' in props;
  if (isFootnotes && !showFootnotes) return null;

  return (
    <section
      className={cn(
        isFootnotes &&
          'mt-[calc(var(--md-margin-multiple)*1em)] text-[smaller] text-muted-foreground [&>h2]:sr-only [&>ol]:m-0',
        className,
      )}
      {...props}
    />
  );
};

export const markdownElements = {
  a: Link,
  blockquote: Blockquote,
  h1: heading('h1', 'text-[length:calc(var(--md-font-size)*(1_+_1.5*var(--md-header-multiple)))]'),
  h2: heading('h2', 'text-[length:calc(var(--md-font-size)*(1_+_var(--md-header-multiple)))]'),
  h3: heading('h3', 'text-[length:calc(var(--md-font-size)*(1_+_0.5*var(--md-header-multiple)))]'),
  h4: heading('h4', 'text-[length:calc(var(--md-font-size)*(1_+_0.25*var(--md-header-multiple)))]'),
  h5: heading('h5', 'text-(length:--md-font-size)'),
  h6: heading('h6', 'text-(length:--md-font-size)'),
  hr: Rule,
  inlineCode: InlineCode,
  li: ListItem,
  ol: OrderedList,
  p: Paragraph,
  section: Section,
  strong: Strong,
  ul: UnorderedList,
};
