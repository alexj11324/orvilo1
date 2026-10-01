import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat';

import SearchXNGIcon from './SearchXNGIcon';
import { FormAction } from './style';

interface ConfigAlertProps {
  id: string;
  provider: string;
}

const ConfigAlert = memo<ConfigAlertProps>(({ provider, id }) => {
  const { t } = useTranslation('plugin');

  const [resend, deleteMessage] = useChatStore((s) => [s.reInvokeToolMessage, s.deleteMessage]);

  const [loading, setLoading] = useState(false);

  const avatar = useMemo(() => {
    switch (provider) {
      default: {
        return <SearchXNGIcon />;
      }
    }
  }, [provider]);

  return (
    <div className="flex flex-col items-center justify-center gap-4" style={{ width: 400 }}>
      <FormAction
        avatar={avatar}
        description={t('search.searchxng.unconfiguredDesc')}
        title={t('search.searchxng.unconfiguredTitle')}
      >
        <div className="flex flex-col gap-3 w-[100%]">
          <Button
            className="w-full"
            disabled={loading}
            style={{ marginTop: 8 }}
            onClick={async () => {
              setLoading(true);
              resend(id).then(() => {
                setLoading(false);
              });
              // deleteMessage(id);
            }}
          >
            {t('search.config.confirm')}
          </Button>
          <Button
            variant={'secondary'}
            onClick={() => {
              deleteMessage(id);
            }}
          >
            {t('search.config.close')}
          </Button>
        </div>
      </FormAction>
    </div>
  );
});

export default ConfigAlert;
