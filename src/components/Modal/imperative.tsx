'use client';

import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import { Dialog } from '@base-ui/react/dialog';
import { t } from 'i18next';
import {
  type FC,
  memo,
  type MouseEvent,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import {
  AlertModalBackdrop,
  AlertModalClose,
  AlertModalPopup,
  AlertModalPortal,
  AlertModalTitle,
  ModalBackdrop,
  ModalClose,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalPopup,
  ModalPortal,
  ModalTitle,
} from './atoms';
import { ModalContext, useModalContext } from './context';
import type {
  ImperativeModalProps,
  ModalButtonProps,
  ModalConfirmConfig,
  ModalInstance,
} from './types';

const useClient = () => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  return isClient;
};

interface ConfirmBodyProps {
  config: ModalConfirmConfig;
}

const ConfirmBody = ({ config }: ConfirmBodyProps) => {
  const { close } = useModalContext();
  const [loading, setLoading] = useState(false);
  const {
    cancelText = t('cancel', { ns: 'common' }),
    content,
    okButtonProps,
    okText = t('ok', { defaultValue: 'OK', ns: 'common' }),
    onCancel,
    onOk,
  } = config;

  const handleCancel = useCallback(() => {
    close();
    onCancel?.();
  }, [close, onCancel]);

  const handleOk = useCallback(async () => {
    if (onOk) {
      try {
        const result = onOk();
        if (result && typeof (result as Promise<void>).then === 'function') {
          setLoading(true);
          await result;
          setLoading(false);
        }
      } catch {
        setLoading(false);
        return;
      }
    }
    close();
  }, [close, onOk]);

  const { onClick: okOnClick, ...restOk } = okButtonProps ?? {};

  return (
    <>
      {content && <div style={{ padding: '12px 16px' }}>{content}</div>}
      <ModalFooter>
        <Button variant="outline" onClick={handleCancel}>
          {cancelText}
        </Button>
        <Button
          disabled={restOk.disabled || loading}
          variant={restOk.danger ? 'destructive' : 'default'}
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            okOnClick?.(e);
            void handleOk();
          }}
        >
          {loading && <Spinner data-icon="inline-start" />}
          {okText}
        </Button>
      </ModalFooter>
    </>
  );
};
ConfirmBody.displayName = 'ConfirmBody';

interface ModalEntry {
  id: string;
  props: ImperativeModalProps & { alert?: boolean; open?: boolean };
}

interface ModalSystem {
  confirmModal: (config: ModalConfirmConfig) => { close: () => void; destroy: () => void };
  createModal: (props: ImperativeModalProps) => ModalInstance;
  ModalHost: FC<{ root?: HTMLElement | ShadowRoot | null }>;
}

function createModalSystem(): ModalSystem {
  let modalStack: ModalEntry[] = [];
  let modalSeed = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const EMPTY: ModalEntry[] = [];
  const getSnapshot = () => modalStack;
  const getServerSnapshot = () => EMPTY;

  const updateModal = (id: string, next: Partial<ImperativeModalProps & { open?: boolean }>) => {
    let changed = false;
    modalStack = modalStack.map((item) => {
      if (item.id !== id) return item;
      changed = true;
      return { ...item, props: { ...item.props, ...next } };
    });
    if (changed) notify();
  };

  const closeModal = (id: string) => updateModal(id, { open: false });

  const destroyModal = (id: string) => {
    const next = modalStack.filter((item) => item.id !== id);
    if (next.length === modalStack.length) return;
    modalStack = next;
    notify();
  };

  const StackItem = memo(({ entry }: { entry: ModalEntry }) => {
    const { id, props } = entry;
    const {
      alert,
      children,
      className,
      classNames,
      content,
      footer,
      maskClosable,
      onOpenChange,
      onOpenChangeComplete,
      open,
      styles: semanticStyles,
      title,
      width,
    } = props;
    const isOpen = open ?? true;

    const handleOpenChange = useCallback(
      (nextOpen: boolean, eventDetails?: { reason?: string }) => {
        if (!nextOpen && maskClosable === false && eventDetails?.reason === 'outside-press') return;
        if (!nextOpen) closeModal(id);
        onOpenChange?.(nextOpen);
      },
      [id, maskClosable, onOpenChange],
    );

    const handleExitComplete = useCallback(
      (nextOpen: boolean) => {
        if (nextOpen) return;
        onOpenChangeComplete?.(false);
        setTimeout(() => destroyModal(id), 0);
      },
      [id, onOpenChangeComplete],
    );

    const close = useCallback(() => closeModal(id), [id]);
    const setCanDismissByClickOutside = useCallback(
      (value: boolean) => updateModal(id, { maskClosable: value }),
      [id],
    );

    const showTitle = title !== undefined && title !== false && title !== null;

    if (alert)
      return (
        <ModalContext value={{ close, setCanDismissByClickOutside }}>
          <AlertDialogPrimitive.Root
            open={isOpen}
            onOpenChange={handleOpenChange}
            onOpenChangeComplete={handleExitComplete}
          >
            <AlertModalPortal>
              <AlertModalBackdrop
                className={classNames?.backdrop}
                style={semanticStyles?.backdrop}
              />
              <AlertModalPopup
                // Confirm dialogs presented role=dialog before the base-ui
                // migration; keep that exposed role for callers/tests.
                className={classNames?.popup ?? className}
                role="dialog"
                style={semanticStyles?.popup}
                width={width}
              >
                {showTitle && (
                  <ModalHeader className={classNames?.header} style={semanticStyles?.header}>
                    <AlertModalTitle className={classNames?.title} style={semanticStyles?.title}>
                      {title}
                    </AlertModalTitle>
                    <AlertModalClose className={classNames?.close} style={semanticStyles?.close} />
                  </ModalHeader>
                )}
                <ModalContent
                  className={classNames?.content}
                  style={{
                    ...(showTitle ? undefined : { paddingTop: 16 }),
                    ...semanticStyles?.content,
                  }}
                >
                  {content ?? children}
                </ModalContent>
                {footer}
              </AlertModalPopup>
            </AlertModalPortal>
          </AlertDialogPrimitive.Root>
        </ModalContext>
      );

    return (
      <ModalContext value={{ close, setCanDismissByClickOutside }}>
        <Dialog.Root
          open={isOpen}
          onOpenChange={handleOpenChange}
          onOpenChangeComplete={handleExitComplete}
        >
          <ModalPortal>
            <ModalBackdrop className={classNames?.backdrop} style={semanticStyles?.backdrop} />
            <ModalPopup
              className={classNames?.popup ?? className}
              style={semanticStyles?.popup}
              width={width}
            >
              {showTitle && (
                <ModalHeader className={classNames?.header} style={semanticStyles?.header}>
                  <ModalTitle className={classNames?.title} style={semanticStyles?.title}>
                    {title}
                  </ModalTitle>
                  <ModalClose className={classNames?.close} style={semanticStyles?.close} />
                </ModalHeader>
              )}
              <ModalContent
                className={classNames?.content}
                style={{
                  ...(showTitle ? undefined : { paddingTop: 16 }),
                  ...semanticStyles?.content,
                }}
              >
                {content ?? children}
              </ModalContent>
              {footer}
            </ModalPopup>
          </ModalPortal>
        </Dialog.Root>
      </ModalContext>
    );
  });
  StackItem.displayName = 'ModalStackItem';

  const StackRenderer = memo(({ stack }: { stack: ModalEntry[] }) => {
    const isClient = useClient();
    if (!isClient) return null;
    return (
      <>
        {stack.map((entry) => (
          <StackItem entry={entry} key={entry.id} />
        ))}
      </>
    );
  });
  StackRenderer.displayName = 'ModalStackRenderer';

  const ModalHost: FC<{ root?: HTMLElement | ShadowRoot | null }> = ({ root }) => {
    const stack = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const isClient = useClient();
    if (!isClient || stack.length === 0) return null;
    return createPortal(<StackRenderer stack={stack} />, (root as HTMLElement) ?? document.body);
  };

  const create = (props: ImperativeModalProps & { alert?: boolean }): ModalInstance => {
    const id = `modal-${Date.now()}-${modalSeed++}`;
    modalStack = [...modalStack, { id, props: { ...props, open: props.open ?? true } }];
    notify();
    return {
      close: () => closeModal(id),
      destroy: () => destroyModal(id),
      setCanDismissByClickOutside: (value: boolean) => updateModal(id, { maskClosable: value }),
      update: (nextProps) => updateModal(id, nextProps),
    };
  };

  const confirm = (config: ModalConfirmConfig) => {
    const instance = create({
      alert: true,
      content: <ConfirmBody config={config} />,
      styles: { content: { padding: 0 } },
      title: config.title,
      width: 420,
    });
    return { close: instance.close, destroy: instance.destroy };
  };

  return { ModalHost, confirmModal: confirm, createModal: create };
}

const defaultSystem = createModalSystem();

const ModalHost = defaultSystem.ModalHost;
const createModal = defaultSystem.createModal;
const confirmModal = defaultSystem.confirmModal;

export { confirmModal, createModal, createModalSystem, ModalHost };
export type { ModalSystem };
export type { ModalButtonProps };
