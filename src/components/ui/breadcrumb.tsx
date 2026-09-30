'use client';

import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';

function Breadcrumb({ className, ...props }: ComponentProps<'nav'>) {
  return <nav aria-label="breadcrumb" className={className} {...props} />;
}

function BreadcrumbList({ className, ...props }: ComponentProps<'ol'>) {
  return (
    <ol className={cn('flex flex-wrap items-center gap-1.5 break-words', className)} {...props} />
  );
}

function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>) {
  return <li className={cn('inline-flex items-center gap-1.5', className)} {...props} />;
}

function BreadcrumbLink({ className, ...props }: ComponentProps<'a'>) {
  return <a className={cn('transition-colors hover:text-foreground', className)} {...props} />;
}

function BreadcrumbPage({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      aria-current="page"
      aria-disabled="true"
      className={cn('font-normal text-foreground', className)}
      role="link"
      {...props}
    />
  );
}

function BreadcrumbSeparator({ children, className, ...props }: ComponentProps<'li'>) {
  return (
    <li
      aria-hidden="true"
      className={cn('[&>svg]:size-3.5', className)}
      role="presentation"
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  );
}

function BreadcrumbEllipsis({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-9 items-center justify-center', className)}
      role="presentation"
      {...props}
    >
      &#8230;
      <span className="sr-only">More</span>
    </span>
  );
}

export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
};
