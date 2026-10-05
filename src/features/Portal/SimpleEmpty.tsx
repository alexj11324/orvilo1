'use client';

import type { LucideIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';

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
  icon?: LucideIcon;
  title?: ReactNode;
}

const SimpleEmpty = memo<SimpleEmptyProps>(({ children, description, icon: IconComp, title }) => (
  <Empty>
    <EmptyHeader>
      {IconComp ? (
        <EmptyMedia variant={'icon'}>
          <IconComp />
        </EmptyMedia>
      ) : null}
      {title ? <EmptyTitle>{title}</EmptyTitle> : null}
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
    {children}
  </Empty>
));

SimpleEmpty.displayName = 'SimpleEmpty';

export default SimpleEmpty;
