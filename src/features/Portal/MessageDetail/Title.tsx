import { cn } from 'cn';
import { useTranslation } from 'react-i18next';

import { oneLineEllipsis } from '@/styles';

const Title = () => {
  const { t } = useTranslation('portal');

  return (
    <div className="flex flex-row items-center gap-1">
      <div className={cn('text-muted-foreground', oneLineEllipsis)} style={{ fontSize: 16 }}>
        {t('messageDetail')}
      </div>
    </div>
  );
};

export default Title;
