import { BrainCircuitIcon } from 'lucide-react';
import { type ComponentProps, type ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

interface MemoryEmptyProps extends ComponentProps<'div'> {
  children?: ReactNode | ReactNode[];
  search?: boolean;
  title?: ReactNode;
}

const MemoryEmpty = memo<MemoryEmptyProps>(({ search, title, children, ...rest }) => {
  const { t } = useTranslation('memory');
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ height: '100%', width: '100%', minHeight: '50vh' }}
    >
      <Empty style={{ maxWidth: 550 }} {...rest}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BrainCircuitIcon />
          </EmptyMedia>
          {!search && <EmptyTitle>{title || t('empty.title')}</EmptyTitle>}
          <EmptyDescription style={{ fontSize: 14 }}>
            {search ? t('empty.search') : t('empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-col">{children}</div>
        </EmptyContent>
      </Empty>
    </div>
  );
});

export default MemoryEmpty;
