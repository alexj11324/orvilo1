import { Tabs, Tag } from '@lobehub/ui/base-ui';
import { type ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

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
          <Tag>{count}</Tag>
        </div>
        <Tabs
          activeKey={mode}
          style={{ flex: 'none', width: 'auto' }}
          items={[
            {
              key: ModeType.Docs,
              label: t('mcp.details.schema.mode.docs'),
            },
            {
              key: ModeType.JSON,
              label: 'JSON',
            },
          ]}
          onChange={(key) => setMode?.(key as ModeType)}
        />
      </div>
      <p className={styles.sectionDesc} style={{ marginTop: -6 }}>
        {desc}
      </p>
      {children}
    </div>
  );
});

export default Block;
