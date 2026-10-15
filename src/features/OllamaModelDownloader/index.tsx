import { Ollama } from '@lobehub/icons';
import { Alert, Button, Input, Progress } from '@lobehub/ui/base-ui';
import { type ReactNode } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import FormAction from '@/components/FormAction';
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
    const { t } = useTranslation(['modelProvider', 'error']);

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
          avatar={<Ollama color={'var(--primary)'} size={64} />}
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
            <Progress showInfo percent={percent} strokeColor={'var(--success)'} />
            <div className="flex w-full justify-between text-xs text-foreground-description">
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
          {error?.message && (
            <Alert
              closable
              description={error.message}
              showIcon={false}
              title={t('ollama.download.failed')}
              type={'error'}
            />
          )}
          <Button
            block
            loading={isDownloading}
            style={{ marginTop: 8 }}
            type={'primary'}
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
