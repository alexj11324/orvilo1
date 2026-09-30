import { type AudioPlayerProps } from '@lobehub/tts/react';
import { AudioPlayer } from '@lobehub/tts/react';
import { ActionIcon, Alert, Button } from '@lobehub/ui/base-ui';
import { type ChatMessageError } from '@orvilo/types';
import { TrashIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/ui/code-block';

interface PlayerProps extends AudioPlayerProps {
  error?: ChatMessageError;
  onDelete: () => void;
  onRetry?: () => void;
}

const Player = memo<PlayerProps>(({ onRetry, error, onDelete, audio, isLoading, onInitPlay }) => {
  const { t } = useTranslation('chat');

  return (
    <div className="flex items-center" style={{ minWidth: 200, width: '100%' }}>
      {error ? (
        <Alert
          closable
          style={{ alignItems: 'center', width: '100%' }}
          title={error.message}
          type="error"
          action={
            <Button size={'small'} type={'primary'} onClick={onRetry}>
              {t('retry', { ns: 'common' })}
            </Button>
          }
          extra={
            error.body && (
              <CodeBlock
                code={JSON.stringify(error.body, null, 2)}
                language="json"
                variant="ghost"
              />
            )
          }
          onClose={onDelete}
        />
      ) : (
        <>
          <AudioPlayer
            allowPause={false}
            audio={audio}
            buttonSize={'small'}
            isLoading={isLoading}
            timeRender={'tag'}
            timeStyle={{ margin: 0 }}
            onInitPlay={onInitPlay}
            onLoadingStop={stop}
          />
          <ActionIcon icon={TrashIcon} size={'small'} title={t('tts.clear')} onClick={onDelete} />
        </>
      )}
    </div>
  );
});

export default Player;
