'use client';

import { cn } from 'cn';
import { type ComponentProps, type ComponentType, isValidElement, type ReactNode } from 'react';

import { Image } from '@/components/ImagePreview';
import { Badge } from '@/components/reui/badge';
import { Tabs as NativeTabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { citationHref } from './Citation';
import styles from './markdown.module.css';

const calloutRoles = {
  tip: 'border-success-border bg-success-wash',
  error: 'border-destructive-border bg-destructive-wash',
  important: 'border-primary-border bg-primary-wash',
  info: 'border-info-border bg-info-wash',
  warning: 'border-warning-border bg-warning-wash',
};
function Callout({
  type = 'info',
  className,
  ...props
}: ComponentProps<'aside'> & { type?: keyof typeof calloutRoles }) {
  return (
    <aside
      {...props}
      className={cn(
        'my-4 flex flex-col gap-2 rounded-(--radius-card) border p-4 text-sm text-foreground',
        calloutRoles[type],
        className,
      )}
    />
  );
}
function Cards({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('my-4 grid grid-cols-1 gap-4 sm:grid-cols-2', className)} />;
}
function Card({
  title,
  desc,
  href,
  image,
  icon: Icon,
  tag,
  className,
  children,
  ...props
}: Omit<ComponentProps<'article'>, 'title'> & {
  title: string;
  desc?: string;
  href?: string;
  image?: string;
  tag?: string;
  icon?: ComponentType<{ className?: string }> | ReactNode;
}) {
  const content = (
    <article
      {...props}
      className={cn(
        'h-full overflow-hidden rounded-(--radius-card) border border-divider bg-card text-foreground',
        className,
      )}
    >
      {image && <Image alt={title} className="w-full" preview={false} src={image} />}
      <div className="flex flex-col gap-2 p-4">
        {tag && <Badge className="self-start">{tag}</Badge>}
        {typeof Icon === 'function' ? (
          <Icon className="size-5 text-muted-foreground" />
        ) : isValidElement(Icon) ? (
          Icon
        ) : null}
        <span aria-level={3} className="text-base font-semibold" role="heading">
          {title}
        </span>
        {desc && <p className="text-sm text-foreground-description">{desc}</p>}
        {children}
      </div>
    </article>
  );
  const destination = href ? citationHref(href) : undefined;
  return destination ? (
    <a
      className="rounded-(--radius-card) focus-visible:outline-2 focus-visible:outline-ring"
      href={destination}
      rel="noopener noreferrer"
      target={destination.startsWith('http') ? '_blank' : undefined}
    >
      {content}
    </a>
  ) : (
    content
  );
}
function Steps({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn(styles.steps, 'relative my-4 ps-10', className)} />;
}
function FileTree({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={cn(
        'my-4 rounded-(--radius-card) border border-divider px-4 py-3 text-sm text-muted-foreground',
        className,
      )}
    />
  );
}
function Tab(props: ComponentProps<'div'>) {
  return <div {...props} />;
}
function Tabs({
  defaultIndex = '0',
  items,
  children,
  className,
  tabNavProps,
}: {
  defaultIndex?: number | string;
  items: string[];
  children?: ReactNode;
  className?: string;
  tabNavProps?: Omit<Partial<ComponentProps<typeof NativeTabs>>, 'children' | 'onValueChange'> & {
    onChange?: (value: string) => void;
  };
}) {
  // MDX supplies one panel per child; normalize nested arrays/iterables while
  // keeping elements (including fragments) opaque and dropping empty slots.
  const panels: ReactNode[] = [];
  const appendPanel = (node: ReactNode): void => {
    if (node == null || typeof node === 'boolean') return;
    if (typeof node === 'object' && Symbol.iterator in node && !isValidElement(node)) {
      for (const child of node as Iterable<ReactNode>) appendPanel(child);
      return;
    }
    panels.push(node);
  };
  appendPanel(children);
  const { onChange, className: navClassName, ...navProps } = tabNavProps ?? {};
  return (
    <NativeTabs
      {...navProps}
      defaultValue={String(defaultIndex)}
      className={cn(
        'my-4 rounded-(--radius-card) border border-divider p-3',
        className,
        navClassName,
      )}
      onValueChange={(value) => onChange?.(String(value))}
    >
      <TabsList>
        {items.map((label, index) => (
          <TabsTrigger key={index} value={String(index)}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {panels.map((panel, index) => (
        <TabsContent key={index} value={String(index)}>
          {panel}
        </TabsContent>
      ))}
    </NativeTabs>
  );
}
function Video({ className, ...props }: ComponentProps<'video'>) {
  return (
    <video controls {...props} className={cn('my-4 w-full rounded-(--radius-card)', className)} />
  );
}

/** Real native counterparts for the old MDX constructor map. */
export const mdxElements = { Callout, Card, Cards, FileTree, Image, Steps, Tab, Tabs, Video };
