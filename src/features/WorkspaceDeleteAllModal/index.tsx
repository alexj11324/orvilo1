'use client';

import { memo, useCallback, useState } from 'react';

import { createModal, type ModalInstance, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface WorkspaceDeleteAllModalContentProps {
  acknowledgeText: string;
  cancelText: string;
  confirmText: string;
  description: string;
  onConfirm: () => Promise<void>;
}

const WorkspaceDeleteAllModalContent = memo<WorkspaceDeleteAllModalContentProps>(
  ({ acknowledgeText, cancelText, confirmText, description, onConfirm }) => {
    const { close } = useModalContext();
    const [acknowledged, setAcknowledged] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleConfirm = useCallback(async () => {
      if (!acknowledged || loading) return;

      setLoading(true);
      try {
        await onConfirm();
        close();
      } finally {
        setLoading(false);
      }
    }, [acknowledged, close, loading, onConfirm]);

    return (
      <div className="flex flex-col gap-5">
        <div className="text-muted-foreground">{description}</div>
        <label className="flex items-center gap-2">
          <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} />
          {acknowledgeText}
        </label>
        <div className="flex justify-end gap-2">
          <Button disabled={loading} onClick={close}>
            {cancelText}
          </Button>
          <Button
            disabled={!acknowledged}
            loading={loading}
            variant="destructive"
            onClick={handleConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    );
  },
);

WorkspaceDeleteAllModalContent.displayName = 'WorkspaceDeleteAllModalContent';

export interface OpenWorkspaceDeleteAllModalOptions {
  acknowledgeText: string;
  cancelText: string;
  confirmText: string;
  description: string;
  onConfirm: () => Promise<void>;
  title: string;
}

export const openWorkspaceDeleteAllModal = ({
  acknowledgeText,
  cancelText,
  confirmText,
  description,
  onConfirm,
  title,
}: OpenWorkspaceDeleteAllModalOptions): ModalInstance =>
  createModal({
    content: (
      <WorkspaceDeleteAllModalContent
        acknowledgeText={acknowledgeText}
        cancelText={cancelText}
        confirmText={confirmText}
        description={description}
        onConfirm={onConfirm}
      />
    ),
    footer: null,
    maskClosable: false,
    styles: { header: { borderBottom: 'none' } },
    title,
    width: 'min(90vw, 480px)',
  });
