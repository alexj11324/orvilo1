'use client';

import { cn } from 'cn';
import { t } from 'i18next';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ModalInstance } from '@/components/Modal';
import { createModal, useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useClientDataSWR } from '@/libs/swr';
import { verifyKeys } from '@/libs/swr/keys';
import { verifyService } from '@/services/verify';
import { formatSize } from '@/utils/format';

import { frostedModalStyles } from './Viewer/Review/modals';

const PREVIEW_BATCH_LIMIT = 20;

const styles = {
  facts:
    'm-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 rounded-(--ant-border-radius-lg) bg-(--ant-color-fill-quaternary) px-3 py-2.5 text-[13px] tabular-nums [&_dt]:m-0 [&_dt]:text-(--ant-color-text-tertiary) [&_dd]:m-0 [&_dd]:text-foreground',
};

interface DeleteConfirmProps {
  description?: string;
  ids: string[];
  onDelete: (purge: boolean) => Promise<unknown>;
  title?: string;
}

const usePurgePreview = (ids: string[]) =>
  useClientDataSWR(
    ids.length > PREVIEW_BATCH_LIMIT ? null : verifyKeys.acceptancePurgePreview(ids.join(',')),
    () => verifyService.getAcceptancePurgePreview(ids),
  );

const DeleteConfirmContent = memo<DeleteConfirmProps>(({ description, ids, onDelete, title }) => {
  const { t: translate } = useTranslation('verify');
  const { close } = useModalContext();
  const [pending, setPending] = useState(false);
  const [purge, setPurge] = useState(false);
  const { data: preview } = usePurgePreview(ids);
  const batch = ids.length > 1;
  const size = preview ? formatSize(preview.bytes) : undefined;

  const run = async () => {
    setPending(true);
    try {
      await onDelete(purge);
      close();
    } catch (error) {
      console.error('[acceptance:deleteConfirm]', error);
      toast.error(translate('acceptance.workspace.deleteError'));
    } finally {
      setPending(false);
    }
  };

  const okLabel =
    !purge || !size
      ? batch
        ? translate('acceptance.workspace.deleteConfirm.okBatchPlain', { count: ids.length })
        : translate('actions.delete')
      : batch
        ? translate('acceptance.workspace.deleteConfirm.okBatch', { count: ids.length, size })
        : translate('acceptance.workspace.deleteConfirm.ok', { size });

  return (
    <div className="flex flex-col gap-3">
      <div className={cn('text-[13px]', purge ? 'text-destructive' : 'text-muted-foreground')}>
        {purge
          ? translate('acceptance.workspace.deleteConfirm.purgeWarning')
          : batch
            ? translate('acceptance.workspace.batch.deleteConfirmDescription', {
                count: ids.length,
              })
            : translate('acceptance.workspace.deleteConfirmDescription', { title })}
      </div>
      {description && <div className="text-[13px] text-muted-foreground">{description}</div>}
      <Checkbox checked={purge} onCheckedChange={(c) => setPurge(c === true)}>
        {size
          ? translate('acceptance.workspace.deleteConfirm.purgeOption', { size })
          : translate('acceptance.workspace.deleteConfirm.purgeOptionPlain')}
      </Checkbox>
      {purge && preview && (
        <dl className={styles.facts}>
          <dt>{translate('acceptance.workspace.deleteConfirm.rounds')}</dt>
          <dd>
            {translate('acceptance.workspace.deleteConfirm.roundsValue', { count: preview.rounds })}
          </dd>
          <dt>{translate('acceptance.workspace.deleteConfirm.files')}</dt>
          <dd>
            {translate('acceptance.workspace.deleteConfirm.filesValue', {
              count: preview.fileCount,
              ...preview.files,
            })}
          </dd>
          <dt>{translate('acceptance.workspace.deleteConfirm.space')}</dt>
          <dd>{formatSize(preview.bytes)}</dd>
        </dl>
      )}
      <div className="flex gap-2 justify-end">
        <Button disabled={pending} onClick={close}>
          {translate('actions.cancel')}
        </Button>
        <Button loading={pending} variant="destructive" onClick={() => void run()}>
          {okLabel}
        </Button>
      </div>
    </div>
  );
});

DeleteConfirmContent.displayName = 'AcceptanceDeleteConfirmContent';

export const openAcceptanceDeleteConfirm = (options: DeleteConfirmProps): ModalInstance =>
  createModal({
    content: <DeleteConfirmContent {...options} />,
    footer: null,
    maskClosable: true,
    styles: frostedModalStyles,
    title:
      options.ids.length > 1
        ? t('acceptance.workspace.batch.deleteConfirmTitle', {
            count: options.ids.length,
            ns: 'verify',
          })
        : t('acceptance.workspace.deleteConfirmTitle', { ns: 'verify', title: options.title }),
    width: 'min(90vw, 440px)',
  });
