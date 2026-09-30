import { MessageSquareText } from 'lucide-react';
import { type ComponentProps, memo } from 'react';
import { useTranslation } from 'react-i18next';

import SimpleEmpty from '@/components/SimpleEmpty';

interface TopicEmptyProps extends Omit<ComponentProps<typeof SimpleEmpty>, 'description' | 'icon'> {
  search?: boolean;
}

const TopicEmpty = memo<TopicEmptyProps>(({ search, ...rest }) => {
  const { t } = useTranslation('topic');

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ minHeight: '50vh', height: '100%', width: '100%' }}
    >
      <SimpleEmpty
        description={search ? t('searchResultEmpty') : t('guide.desc')}
        descriptionProps={{ fontSize: 14 }}
        icon={MessageSquareText}
        style={{ maxWidth: 400 }}
        {...rest}
      />
    </div>
  );
});

TopicEmpty.displayName = 'TopicEmpty';

export default TopicEmpty;
