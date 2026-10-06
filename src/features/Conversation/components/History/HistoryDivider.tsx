import { Timer } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { Separator } from '@/components/ui/separator';

interface HistoryDividerProps {
  enable?: boolean;
}

const HistoryDivider = memo<HistoryDividerProps>(({ enable }) => {
  const { t } = useTranslation('common');
  if (!enable) return null;

  return (
    <div className="flex items-center gap-4 px-5 py-5">
      <Separator className="flex-1" />
      <Badge className="shrink-0">
        <Timer /> {t('historyRange')}
      </Badge>
      <Separator className="flex-1" />
    </div>
  );
});

export default HistoryDivider;
