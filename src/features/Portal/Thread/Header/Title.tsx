import { Skeleton } from '@/components/ui/skeleton';
import { useChatStore } from '@/store/chat';

import ActiveThread from './Active';
import NewThread from './New';

const Header = () => {
  const isInNew = useChatStore((s) => s.startToForkThread);

  const isInit = useChatStore((s) => s.threadsInit);

  if (!isInit) return <Skeleton style={{ height: 22, width: 200 }} />;

  return isInNew ? <NewThread /> : <ActiveThread />;
};

export default Header;
