import { Text } from '@lobehub/ui/base-ui';
import { useTranslation } from 'react-i18next';

import { oneLineEllipsis } from '@/styles';

const Title = () => {
  const { t } = useTranslation('portal');

  return (
    <div className="flex flex-row items-center gap-1">
      <Text className={oneLineEllipsis} style={{ fontSize: 16 }} type={'secondary'}>
        {t('messageDetail')}
      </Text>
    </div>
  );
};

export default Title;
