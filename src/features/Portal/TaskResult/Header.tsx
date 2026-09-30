import { ListTodo } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

import PortalHeader from '../components/Header';
import Title from './Title';

const Header = memo(() => {
  const { t } = useTranslation('chat');
  const taskId = useChatStore(chatPortalSelectors.taskResultId);
  const openTaskDetail = useChatStore((state) => state.openTaskDetail);

  return (
    <PortalHeader
      title={<Title />}
      rightExtra={
        <Button
          disabled={!taskId}
          size="sm"
          variant="ghost"
          onClick={() => taskId && openTaskDetail(taskId)}
        >
          <ListTodo data-icon="inline-start" />
          {t('goalDetail.viewOriginalTask')}
        </Button>
      }
    />
  );
});

Header.displayName = 'TaskResultPortalHeader';
export default Header;
