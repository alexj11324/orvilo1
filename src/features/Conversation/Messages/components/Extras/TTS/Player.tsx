import { type AudioPlayerProps } from '@lobehub/tts/react';
import { AudioPlayer } from '@lobehub/tts/react';
import { type ChatMessageError } from '@orvilo/types';
import { CircleAlert, TrashIcon, X } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
        <Alert style={{ alignItems: 'center', width: '100%' }} variant="destructive">
          <CircleAlert />
          <AlertTitle>{error.message}</AlertTitle>
          <AlertAction>
            <Button size="sm" variant="default" onClick={onRetry}>
              {t('retry', { ns: 'common' })}
            </Button>
            <ActionIcon icon={X} size="small" onClick={onDelete} />
          </AlertAction>
          {error.body && (
            <Collapsible className="col-start-2">
              <CollapsibleTrigger className="text-xs text-muted-foreground">
                Show Details
              </CollapsibleTrigger>
              <CollapsibleContent>
                <AlertDescription>
                  <CodeBlock
                    code={JSON.stringify(error.body, null, 2)}
                    language="json"
                    variant="ghost"
                  />
                </AlertDescription>
              </CollapsibleContent>
            </Collapsible>
          )}
        </Alert>
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
