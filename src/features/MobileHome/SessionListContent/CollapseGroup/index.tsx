import { createStaticStyles, responsive } from 'antd-style';
import { type ReactNode } from 'react';
import { memo } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const styles = createStaticStyles(({ css, cssVar }) => ({
  header: css`
    border-radius: ${cssVar.borderRadius};
    color: ${cssVar.colorTextDescription};

    ${responsive.sm} {
      border-radius: 0;
    }

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

export interface CollapseGroupItem {
  children: ReactNode;
  extra?: ReactNode;
  key: string;
  label: ReactNode;
}

interface CollapseGroupProps {
  activeKey?: string[];
  items: CollapseGroupItem[];
  onChange?: (keys: string[]) => void;
}

const CollapseGroup = memo<CollapseGroupProps>(({ activeKey, items, onChange }) => {
  return (
    <Accordion multiple value={activeKey} onValueChange={onChange}>
      {items.map((item) => (
        <AccordionItem key={item.key} value={item.key}>
          <div className={styles.header}>
            <div className="flex min-w-0 flex-1 items-center">
              <AccordionTrigger style={{ paddingInline: '16px 10px' }}>
                {item.label}
              </AccordionTrigger>
            </div>
            {item.extra && <div className="flex shrink-0 items-center">{item.extra}</div>}
          </div>
          <AccordionContent>{item.children}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
});

export default CollapseGroup;
