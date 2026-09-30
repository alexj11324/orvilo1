import { Plus } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useActionSWR } from '@/libs/swr';
import { sessionKeys } from '@/libs/swr/keys';
import { useServerConfigStore } from '@/store/serverConfig';
import { useSessionStore } from '@/store/session';

const AddButton = memo<{ groupId?: string }>(({ groupId }) => {
  const { t } = useTranslation('chat');
  const createSession = useSessionStore((s) => s.createSession);
  const mobile = useServerConfigStore((s) => s.isMobile);
  const { mutate, isValidating } = useActionSWR(sessionKeys.createSession(groupId), () => {
    return createSession({ group: groupId });
  });

  return (
    <div className="flex flex-col flex-1" style={{ padding: mobile ? 16 : 0 }}>
      <Button
        className="w-full"
        loading={isValidating}
        variant="secondary"
        style={{
          marginTop: 8,
        }}
        onClick={() => mutate()}
      >
        <Plus data-icon="inline-start" />
        {t('newAgent')}
      </Button>
    </div>
  );
});

export default AddButton;
