import { X } from 'lucide-react';
import { type ReactNode } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Ollama } from '@/components/BrandIcons';
import FormAction from '@/components/FormAction';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress, ProgressValue } from '@/components/ui/progress';
import { useActionSWR } from '@/libs/swr';
import { ollamaKeys } from '@/libs/swr/keys';
import { type ModelProgressInfo } from '@/services/models';
import { modelsService } from '@/services/models';
import { formatSize } from '@/utils/format';

import { useDownloadMonitor } from './useDownloadMonitor';

interface OllamaModelDownloaderProps {
  extraAction?: ReactNode;
  model: string;
  onSuccessDownload?: () => void;
}

const OllamaModelDownloader = memo<OllamaModelDownloaderProps>(
  ({ model, onSuccessDownload, extraAction }) => {
    const { t } = useTranslation(['modelProvider', 'error', 'common']);

    const [dismissedError, setDismissedError] = useState<unknown>(null);
    const [modelToPull, setModelToPull] = useState(model);
    const [completed, setCompleted] = useState(0);
    const [total, setTotal] = useState(0);
    const { remainingTime, downloadSpeed } = useDownloadMonitor(total, completed);
    const percent = useMemo(() => {
      return total ? Number(((completed / total) * 100).toFixed(1)) : 0;
    }, [completed, total]);

    // Define progress callback function
    const handleProgress = useCallback((progress: ModelProgressInfo) => {
      if (progress.completed) setCompleted(progress.completed);
      if (progress.total) setTotal(progress.total);
    }, []);

    const {
      mutate,
      isValidating: isDownloading,
      error,
    } = useActionSWR(
      ollamaKeys.downloadModel(modelToPull),
      async () => {
        await modelsService.downloadModel(
          { model: modelToPull, provider: 'ollama' },
          { onProgress: handleProgress },
        );

        return true;
      },
      {
        onSuccess: onSuccessDownload,
      },
    );

    return (
      <div className="flex w-full flex-col items-center justify-center gap-4 py-8">
        <FormAction
          avatar={<Ollama color={'var(--ant-color-primary)'} size={64} />}
          description={isDownloading ? t('ollama.download.desc') : t('ollama.unlock.description')}
          title={
            isDownloading
              ? t('ollama.download.title', { model: modelToPull })
              : t('ollama.unlock.title')
          }
        >
          {!isDownloading && (
            <Input
              value={modelToPull}
              onChange={(e) => {
                setModelToPull(e.target.value);
              }}
            />
          )}
        </FormAction>
        {isDownloading && (
          <div className="flex w-full max-w-75 flex-1 flex-col gap-2">
            <Progress className="[&_[data-slot=progress-indicator]]:bg-success" value={percent}>
              <ProgressValue>{() => `${percent}%`}</ProgressValue>
            </Progress>
            <div className="flex justify-between text-xs text-foreground-description">
              <span>
                {t('ollama.download.remainingTime')}: {remainingTime}
              </span>
              <span>
                {t('ollama.download.speed')}: {downloadSpeed}
              </span>
            </div>
          </div>
        )}
        <div className="flex w-full max-w-75 flex-col gap-3">
          {error?.message && dismissedError !== error && (
            <Alert variant="destructive">
              <AlertTitle>{t('ollama.download.failed')}</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
              <AlertAction>
                <Button
                  aria-label={t('close', { ns: 'common' })}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setDismissedError(error)}
                >
                  <X aria-hidden />
                </Button>
              </AlertAction>
            </Alert>
          )}
          <Button
            className="mt-2 w-full"
            loading={isDownloading}
            type="button"
            onClick={() => {
              mutate();
            }}
          >
            {!isDownloading
              ? t('ollama.unlock.confirm')
              : // if total is 0, show starting, else show downloaded
                !total
                ? t('ollama.unlock.starting')
                : t('ollama.unlock.downloaded', {
                    completed: formatSize(completed, 2),
                    total: formatSize(total, 2),
                  })}
          </Button>
          {isDownloading ? (
            <Button
              onClick={() => {
                modelsService.abortPull();
              }}
            >
              {t('ollama.unlock.cancel')}
            </Button>
          ) : (
            extraAction
          )}
        </div>
      </div>
    );
  },
);

export default OllamaModelDownloader;
