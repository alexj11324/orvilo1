'use client';

import { type ReactNode } from 'react';
import { memo } from 'react';

import type { ModalInstance } from '@/components/Modal';
import { createModal, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';

interface GuideModalContentProps {
  cancelText?: ReactNode;
  cover: ReactNode;
  desc: ReactNode;
  okText?: ReactNode;
  onCancel?: () => void;
  onOk?: () => void;
  title: ReactNode;
}

const GuideModalContent = memo<GuideModalContentProps>(
  ({ cover, title, desc, okText, cancelText, onOk, onCancel }) => {
    const { close } = useModalContext();

    const handleOk = () => {
      onOk?.();
      close();
    };

    const handleCancel = () => {
      onCancel?.();
      close();
    };

    return (
      <div className="flex [&_h3]:m-0 [&_h3]:font-bold [&_p]:m-0">
        {cover}
        <div className={'flex flex-col gap-1 p-4'}>
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
        {(okText || cancelText) && (
          <div className={'flex gap-2 justify-end py-4 px-4'} style={{ paddingTop: 0 }}>
            {cancelText ? <Button onClick={handleCancel}>{cancelText}</Button> : null}
            {okText ? <Button onClick={handleOk}>{okText}</Button> : null}
          </div>
        )}
      </div>
    );
  },
);

GuideModalContent.displayName = 'GuideModalContent';

export interface CreateGuideModalOptions {
  cancelText?: ReactNode;
  cover: ReactNode;
  desc: ReactNode;
  okText?: ReactNode;
  onCancel?: () => void;
  onOk?: () => void;
  title: ReactNode;
  width?: number;
}

export const createGuideModal = ({
  cancelText,
  cover,
  desc,
  okText,
  onCancel,
  onOk,
  title,
  width = 360,
}: CreateGuideModalOptions): ModalInstance =>
  createModal({
    content: (
      <GuideModalContent
        cancelText={cancelText}
        cover={cover}
        desc={desc}
        okText={okText}
        title={title}
        onCancel={onCancel}
        onOk={onOk}
      />
    ),
    footer: null,
    maskClosable: true,
    styles: {
      content: { padding: 0 },
      header: { display: 'none' },
    },
    width,
  });
