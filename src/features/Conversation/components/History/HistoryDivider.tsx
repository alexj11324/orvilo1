import { Tag } from '@lobehub/ui/base-ui';
import { Timer } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Separator } from '@/components/ui/separator';

interface HistoryDividerProps {
  enable?: boolean;
}

const HistoryDivider = memo<HistoryDividerProps>(({ enable }) => {
  const { t } = useTranslation('common');
  if (!enable) return null;

  return (
    <div style={{ padding: '0 20px' }}>
      <Separator style={{ margin: 0, padding: '20px 0' }}>
        <Tag icon={<Timer />}>{t('historyRange')}</Tag>
      </Separator>
    </div>
  );
});

export default HistoryDivider;
