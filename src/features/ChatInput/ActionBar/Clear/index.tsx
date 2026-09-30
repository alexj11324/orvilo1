import { Eraser } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogConfirm,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useChatStore } from '@/store/chat';
import { useFileStore } from '@/store/file';

import { useChatInputResourceAccess } from '../../hooks/useChatInputResourceAccess';
import { ChatInputAction } from '../components/ChatInputAction';

export const useClearCurrentMessages = () => {
  const clearMessage = useChatStore((s) => s.clearMessage);
  const clearImageList = useFileStore((s) => s.clearChatUploadFileList);

  return useCallback(async () => {
    await clearMessage();
    clearImageList();
  }, [clearImageList, clearMessage]);
};

const Clear = memo(() => {
  const { t } = useTranslation('setting');

  const clearCurrentMessages = useClearCurrentMessages();
  const [confirmOpened, updateConfirmOpened] = useState(false);
  const { allowed: canCreateContent } = usePermission('create_content');
  // Clearing deletes shared conversation messages — view-only members don't
  // get the confirm at all (the trigger Action is already disabled too).
  const { canUseResource } = useChatInputResourceAccess();
  const canCreate = canCreateContent && canUseResource;

  const actionTitle: any = confirmOpened ? void 0 : t('clearCurrentMessages', { ns: 'chat' });

  return (
    <AlertDialog
      open={confirmOpened}
      onOpenChange={(open) => {
        if (!canCreate && open) return;
        updateConfirmOpened(open);
      }}
    >
      <AlertDialogTrigger
        render={
          <ChatInputAction
            icon={Eraser}
            title={actionTitle}
            tooltipProps={{
              placement: 'bottom',
              styles: {
                root: { maxWidth: 'none' },
              },
            }}
          />
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="whitespace-pre-line break-words">
            {t('confirmClearCurrentMessages', { ns: 'chat' })}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel', { ns: 'common' })}</AlertDialogCancel>
          <AlertDialogConfirm
            disabled={!canCreate}
            variant="destructive"
            onClick={() => {
              if (!canCreate) return;
              clearCurrentMessages();
            }}
          >
            {t('ok', { ns: 'common' })}
          </AlertDialogConfirm>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

export default Clear;
