'use client';

import { isRecord } from '@orvilo/utils/object';
import { $createNodeSelection, $getNodeByKey, $setSelection } from 'lexical';
import type { MouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import Link from '@/components/Link';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import type { NativeWidgetProps } from './session';

export interface NativeLinkSnapshot {
  description?: string;
  icon?: string;
  openTarget?: string;
  payload?: unknown;
  schemaType?: string;
  src?: string;
  title?: string;
  type: string;
  url?: string;
}
function useDecoration({ node, editor }: NativeWidgetProps) {
  const key = node.getKey();
  const read = useCallback(
    () =>
      editor.getEditorState().read(() => {
        const current = $getNodeByKey(key);
        return { data: current?.exportJSON(), selected: current?.isSelected() ?? false };
      }),
    [editor, key],
  );
  const [snapshot, setSnapshot] = useState(read);
  useEffect(() => {
    setSnapshot(read());
    const detach = editor.registerUpdateListener(() => setSnapshot(read()));
    const editable = editor.registerEditableListener(() => setSnapshot(read()));
    return () => {
      detach();
      editable();
    };
  }, [editor, read]);
  return {
    ...snapshot,
    select(event: MouseEvent<HTMLElement>) {
      if (!editor.isEditable()) return;
      event.preventDefault();
      event.stopPropagation();
      editor.focus();
      editor.update(() => {
        const selection = $createNodeSelection();
        selection.add(key);
        $setSelection(selection);
      });
    },
  };
}
/** Keep native node JSON untouched; renderer snapshots are read inside Lexical. */
function readLink(value: unknown): NativeLinkSnapshot {
  if (!isRecord(value) || typeof value.type !== 'string')
    throw new Error('Link snapshot unavailable');
  return {
    type: value.type,
    url: typeof value.url === 'string' ? value.url : undefined,
    src: typeof value.src === 'string' ? value.src : undefined,
    title: typeof value.title === 'string' ? value.title : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    icon: typeof value.icon === 'string' ? value.icon : undefined,
    openTarget: typeof value.openTarget === 'string' ? value.openTarget : undefined,
    schemaType: typeof value.schemaType === 'string' ? value.schemaType : undefined,
    payload: value.payload,
  };
}
function href(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value, 'https://orvilo.invalid');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}
export function NativeMentionWidget(props: NativeWidgetProps) {
  const { data, selected, select } = useDecoration(props);
  const label = isRecord(data) && typeof data.label === 'string' ? data.label : '';
  return (
    <span
      contentEditable={false}
      className={cn(
        'editor_mention inline-flex rounded-(--radius-input) bg-accent px-1 text-sm text-foreground',
        selected && 'ring-2 ring-ring',
      )}
      onMouseDown={select}
    >
      @{label}
    </span>
  );
}
export function NativeLinkCardWidget(props: NativeWidgetProps) {
  const { data, selected, select } = useDecoration(props);
  const link = readLink(data);
  const target = link.openTarget === '_self' ? '_self' : '_blank';
  return (
    <span
      contentEditable={false}
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-(--radius-card) border border-divider bg-background px-2 py-1 text-sm',
        selected && 'ring-2 ring-ring',
      )}
      onMouseDown={select}
    >
      {link.icon && href(link.icon) ? (
        <img alt="" className="size-4 shrink-0" src={link.icon} />
      ) : null}
      <Link
        href={href(link.url)}
        rel="noopener noreferrer"
        target={target}
        title={link.description}
      >
        {link.title || link.url}
      </Link>
      {link.description && link.type === 'link-block-card' ? (
        <span className="text-muted-foreground">{link.description}</span>
      ) : null}
    </span>
  );
}
export interface NativeIframeRendererProps {
  link: NativeLinkSnapshot;
  onSelect: (event: MouseEvent<HTMLElement>) => void;
  selected: boolean;
  widget: NativeWidgetProps;
}
/** The application owns embed policy and layout; require its real renderer
 * rather than silently reducing existing iframe/schema documents to anchors. */
export function NativeLinkIframeWidget(
  props: NativeWidgetProps & { render: (props: NativeIframeRendererProps) => ReactNode },
) {
  const snapshot = useDecoration(props);
  return props.render({
    link: readLink(snapshot.data),
    selected: snapshot.selected,
    onSelect: snapshot.select,
    widget: props,
  });
}
export function NativeLinkSchemaWidget(
  props: NativeWidgetProps & { render: (props: NativeIframeRendererProps) => ReactNode },
) {
  const snapshot = useDecoration(props);
  return props.render({
    link: readLink(snapshot.data),
    selected: snapshot.selected,
    onSelect: snapshot.select,
    widget: props,
  });
}

export function NativeDefaultIframe({ link, selected, onSelect }: NativeIframeRendererProps) {
  const [loaded, setLoaded] = useState<string>();
  const src = href(link.src || link.url);
  return (
    <div
      contentEditable={false}
      className={cn(
        'relative overflow-hidden rounded-(--radius-card) border border-divider bg-background',
        selected && 'ring-2 ring-ring',
      )}
    >
      <div
        className="border-b border-divider px-2 py-1 text-sm text-muted-foreground"
        onMouseDown={onSelect}
      >
        {link.title || link.url}
      </div>
      {src ? (
        <div className="relative aspect-video w-full">
          {loaded !== src ? (
            <div
              aria-busy="true"
              className="absolute inset-0 flex items-center justify-center bg-accent"
            >
              <Spinner />
            </div>
          ) : null}
          <iframe
            className="size-full border-0"
            loading="lazy"
            src={src}
            title={link.title || link.url || ''}
            onLoad={() => setLoaded(src)}
          />
        </div>
      ) : null}
    </div>
  );
}
export function NativeDefaultSchema({ link, selected, onSelect }: NativeIframeRendererProps) {
  // Preserve the native protocol, payload and title. Applications with custom
  // schema renderers still inject their existing handler through the slot.
  const url =
    link.url && !/^\s*(?:javascript|data|vbscript):/iu.test(link.url) ? link.url : undefined;
  return (
    <span
      contentEditable={false}
      className={cn(
        'inline-flex items-center gap-2 rounded-(--radius-card) border border-divider px-2 py-1 text-sm',
        selected && 'ring-2 ring-ring',
      )}
      onMouseDown={onSelect}
    >
      <span className="text-muted-foreground">{link.schemaType}</span>
      <a href={url}>
        <strong>{link.title || link.url}</strong>
      </a>
    </span>
  );
}
