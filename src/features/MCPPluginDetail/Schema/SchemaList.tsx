import { type ReactNode } from 'react';
import { memo } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

import { styles } from './style';

interface SchemaListProps {
  activeKey?: string[];
  children?: ReactNode;
  setActiveKey?: (key: string[]) => void;
}

export const SchemaList = memo<SchemaListProps>(({ activeKey, setActiveKey, children }) => (
  <Accordion
    multiple
    style={{ overflow: 'hidden' }}
    value={activeKey}
    onValueChange={(keys) => setActiveKey?.(keys as string[])}
  >
    {children}
  </Accordion>
));

interface SchemaItemProps {
  children?: ReactNode;
  desc?: string;
  id: string;
  meta?: ReactNode;
  name: string;
  open?: boolean;
}

export const SchemaItem = memo<SchemaItemProps>(({ id, name, desc, meta, open, children }) => (
  <AccordionItem value={name}>
    <AccordionTrigger style={{ paddingBlock: 12, paddingInline: 14 }}>
      <div className="flex items-start flex-1 gap-3" style={{ minWidth: 0 }}>
        <div className="flex flex-col flex-1" style={{ minWidth: 0 }}>
          <span className={styles.name} id={id}>
            {name}
          </span>
          {desc && !open && <p className={styles.desc}>{desc}</p>}
        </div>
        {meta && <span className={styles.meta}>{meta}</span>}
      </div>
    </AccordionTrigger>
    <AccordionContent className="overflow-x-auto" style={{ padding: '0 14px 16px 36px' }}>
      <div className="flex flex-col gap-3.5">{children}</div>
    </AccordionContent>
  </AccordionItem>
));

export const SchemaEmpty = memo<{ children: ReactNode }>(({ children }) => (
  <div className={styles.empty}>{children}</div>
));

export const SchemaSubtitle = memo<{ children: ReactNode }>(({ children }) => (
  <span className={styles.subtitle}>{children}</span>
));
