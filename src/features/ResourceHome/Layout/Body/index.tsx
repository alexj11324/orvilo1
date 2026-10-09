import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

import LibraryList from './LibraryList';

const SidebarBody = memo<{ itemKey: string }>(({ itemKey }) => {
  const { t } = useTranslation('file');

  return (
    <AccordionItem value={itemKey}>
      <div className="group flex items-center">
        <AccordionTrigger style={{ paddingBlock: 4, paddingInline: '8px 4px' }}>
          <div className="truncate min-w-0 text-[12px] text-muted-foreground font-medium">
            {t('library.title')}
          </div>
        </AccordionTrigger>
      </div>
      <AccordionContent>
        <LibraryList />
      </AccordionContent>
    </AccordionItem>
  );
});

export default SidebarBody;
