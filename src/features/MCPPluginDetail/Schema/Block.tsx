import { type ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { styles } from './style';
import { ModeType } from './types';

interface BlockProps {
  children?: ReactNode;
  count: number;
  desc: string;
  id?: string;
  mode?: ModeType;
  setMode?: (mode: ModeType) => void;
  title: string;
}

const Block = memo<BlockProps>(({ title, count, desc, children, mode, setMode, id }) => {
  const { t } = useTranslation('discover');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-2" style={{ flex: 'none' }}>
          <h2 className={styles.sectionTitle} id={id}>
            {title}
          </h2>
          <Badge variant="secondary">{count}</Badge>
        </div>
        <Tabs
          style={{ flex: 'none', width: 'auto' }}
          value={mode}
          onValueChange={(key) => setMode?.(key as ModeType)}
        >
          <TabsList>
            {[
              {
                key: ModeType.Docs,
                label: t('mcp.details.schema.mode.docs'),
              },
              {
                key: ModeType.JSON,
                label: 'JSON',
              },
            ].map((item) => (
              <TabsTrigger key={item.key} value={item.key}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <p className={styles.sectionDesc} style={{ marginTop: -6 }}>
        {desc}
      </p>
      {children}
    </div>
  );
});

export default Block;
