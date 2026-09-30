'use client';

import { Dialog } from '@base-ui/react/dialog';
import { t } from 'i18next';
import { type FC, memo, type MouseEvent, type ReactNode, useCallback, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import {
  ModalBackdrop,
  ModalClose,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalPopup,
  ModalPortal,
  ModalTitle,
} from './atoms';
import { ModalContext } from './context';
import type { ModalButtonProps, ModalProps } from './types';

interface OkBtnProps {
  confirmLoading?: boolean;
  okButtonProps?: ModalButtonProps;
  okText: React.ReactNode;
  onOk?: (e: MouseEvent<HTMLButtonElement>) => void;
}

const OkBtn = ({ confirmLoading, okButtonProps, okText, onOk }: OkBtnProps) => {
  const { danger, disabled, loading, onClick: userOnClick, style } = okButtonProps ?? {};
  return (
    <Button
      disabled={disabled}
      loading={confirmLoading || loading}
      style={style}
      variant={danger ? 'destructive' : 'default'}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        onOk?.(e);
        userOnClick?.(e);
      }}
    >
      {okText}
    </Button>
  );
};

interface CancelBtnProps {
  cancelButtonProps?: ModalButtonProps;
  cancelText: React.ReactNode;
  onCancel?: () => void;
}

const CancelBtn = ({ cancelButtonProps, cancelText, onCancel }: CancelBtnProps) => {
  const { disabled, loading, onClick: userOnClick, style } = cancelButtonProps ?? {};
  return (
    <Button
      disabled={disabled}
      loading={loading}
      style={style}
      variant="outline"
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        onCancel?.();
        userOnClick?.(e);
      }}
    >
      {cancelText}
    </Button>
  );
};

const Modal = memo<ModalProps>(
  ({
    open,
    title,
    children,
    onOk,
    onCancel,
    okText = t('ok', { defaultValue: 'OK', ns: 'common' }),
    cancelText = t('cancel', { ns: 'common' }),
    okButtonProps,
    cancelButtonProps,
    confirmLoading,
    footer,
    width,
    maskClosable = true,
    closable = true,
    closeIcon,
    className,
    classNames,
    styles: semanticStyles,
    afterClose,
    afterOpenChange,
    loading,
    keyboard,
  }) => {
    const isOpen = open ?? false;

    const handleOpenChange = useCallback(
      (nextOpen: boolean, eventDetails?: { reason?: string }) => {
        if (!isOpen) return;
        if (!nextOpen && keyboard === false && eventDetails?.reason === 'escape-key') return;
        if (!nextOpen && !maskClosable && eventDetails?.reason === 'outside-press') return;
        if (!nextOpen) onCancel?.();
      },
      [isOpen, keyboard, maskClosable, onCancel],
    );

    const handleOpenChangeComplete = useCallback(
      (nextOpen: boolean) => {
        if (!nextOpen) {
          afterClose?.();
          afterOpenChange?.(false);
        } else {
          afterOpenChange?.(true);
        }
      },
      [afterClose, afterOpenChange],
    );

    const footerNode = useMemo(() => {
      if (footer === false || footer === null) return null;
      const cancelBtnNode = (
        <CancelBtn
          cancelButtonProps={cancelButtonProps}
          cancelText={cancelText}
          onCancel={onCancel}
        />
      );
      const okBtnNode = (
        <OkBtn
          confirmLoading={confirmLoading}
          okButtonProps={okButtonProps}
          okText={okText}
          onOk={onOk}
        />
      );
      const defaultFooter = (
        <>
          {cancelBtnNode}
          {okBtnNode}
        </>
      );
      if (typeof footer === 'function') {
        return footer(defaultFooter, {
          CancelBtn: makeBoundBtn(cancelBtnNode),
          OkBtn: makeBoundBtn(okBtnNode),
        });
      }
      return footer ?? defaultFooter;
    }, [
      footer,
      cancelButtonProps,
      cancelText,
      confirmLoading,
      okButtonProps,
      okText,
      onCancel,
      onOk,
    ]);

    const showTitle = title !== undefined && title !== false && title !== null;
    const showHeader = showTitle || closable;
    const close = useCallback(() => onCancel?.(), [onCancel]);

    return (
      <ModalContext value={{ close, setCanDismissByClickOutside: () => void 0 }}>
        <Dialog.Root
          open={isOpen}
          onOpenChange={handleOpenChange}
          onOpenChangeComplete={handleOpenChangeComplete}
        >
          <ModalPortal>
            <ModalBackdrop className={classNames?.backdrop} style={semanticStyles?.backdrop} />
            <ModalPopup
              className={classNames?.popup ?? className}
              style={semanticStyles?.popup}
              width={width}
            >
              {showHeader && (
                <ModalHeader className={classNames?.header} style={semanticStyles?.header}>
                  {showTitle ? (
                    <ModalTitle className={classNames?.title} style={semanticStyles?.title}>
                      {title}
                    </ModalTitle>
                  ) : (
                    <span />
                  )}
                  {closable && (
                    <ModalClose className={classNames?.close} style={semanticStyles?.close}>
                      {closeIcon ?? undefined}
                    </ModalClose>
                  )}
                </ModalHeader>
              )}
              <ModalContent
                className={classNames?.content}
                style={{
                  ...(showHeader ? undefined : { paddingTop: 16 }),
                  ...semanticStyles?.content,
                }}
              >
                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                    <Spinner style={{ height: 24, width: 24 }} />
                  </div>
                ) : (
                  children
                )}
              </ModalContent>
              {footerNode != null && <ModalFooter>{footerNode}</ModalFooter>}
            </ModalPopup>
          </ModalPortal>
        </Dialog.Root>
      </ModalContext>
    );
  },
);

const makeBoundBtn = (node: ReactNode): FC => {
  const BoundBtn: FC = () => <>{node}</>;
  return BoundBtn;
};

Modal.displayName = 'Modal';

export default Modal;
