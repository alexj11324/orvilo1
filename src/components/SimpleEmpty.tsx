'use client';

import type { LucideIcon } from 'lucide-react';
import { type CSSProperties, memo, type ReactNode } from 'react';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

interface SimpleEmptyProps {
  children?: ReactNode;
  description: ReactNode;
  descriptionProps?: CSSProperties;
  icon?: LucideIcon;
  style?: CSSProperties;
  title?: ReactNode;
}

const SimpleEmpty = memo<SimpleEmptyProps>(
  ({ children, description, descriptionProps, icon: IconComp, style, title }) => (
    <Empty style={style}>
      <EmptyHeader>
        {IconComp ? (
          <EmptyMedia variant={'icon'}>
            <IconComp />
          </EmptyMedia>
        ) : null}
        {title ? <EmptyTitle>{title}</EmptyTitle> : null}
        <EmptyDescription style={descriptionProps}>{description}</EmptyDescription>
      </EmptyHeader>
      {children}
    </Empty>
  ),
);

SimpleEmpty.displayName = 'SimpleEmpty';

export default SimpleEmpty;
