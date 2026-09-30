import { type CSSProperties, type MouseEvent, type ReactNode } from 'react';

interface ModalSemanticClassNames {
  backdrop?: string;
  close?: string;
  content?: string;
  footer?: string;
  header?: string;
  popup?: string;
  title?: string;
}

interface ModalSemanticStyles {
  backdrop?: CSSProperties;
  close?: CSSProperties;
  content?: CSSProperties;
  footer?: CSSProperties;
  header?: CSSProperties;
  popup?: CSSProperties;
  title?: CSSProperties;
}

interface BaseModalProps {
  children?: ReactNode;
  className?: string;
  classNames?: ModalSemanticClassNames;
  maskClosable?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  open?: boolean;
  styles?: ModalSemanticStyles;
  title?: ReactNode;
  width?: number | string;
}

interface ModalContextValue {
  close: () => void;
  setCanDismissByClickOutside: (value: boolean) => void;
}

interface ModalInstance extends ModalContextValue {
  destroy: () => void;
  update: (nextProps: Partial<BaseModalProps>) => void;
}

type ImperativeModalProps = BaseModalProps & {
  content?: ReactNode;
  footer?: ReactNode;
};

interface ModalButtonProps {
  [key: string]: unknown;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  style?: CSSProperties;
  type?: string;
}

interface ModalConfirmConfig {
  cancelText?: ReactNode;
  content?: ReactNode;
  okButtonProps?: ModalButtonProps;
  okText?: ReactNode;
  onCancel?: () => void;
  onOk?: (() => void) | (() => Promise<void>);
  title?: ReactNode;
}

interface ModalProps {
  afterClose?: () => void;
  afterOpenChange?: (open: boolean) => void;
  cancelButtonProps?: ModalButtonProps;
  cancelText?: ReactNode;
  children?: ReactNode;
  className?: string;
  classNames?: ModalSemanticClassNames;
  closable?: boolean;
  closeIcon?: ReactNode;
  confirmLoading?: boolean;
  footer?:
    | ReactNode
    | false
    | null
    | ((originNode: ReactNode, extra: { CancelBtn: React.FC; OkBtn: React.FC }) => ReactNode);
  keyboard?: boolean;
  loading?: boolean;
  maskClosable?: boolean;
  okButtonProps?: ModalButtonProps;
  okText?: ReactNode;
  onCancel?: (e: MouseEvent<HTMLButtonElement>) => void;
  onOk?: (e: MouseEvent<HTMLButtonElement>) => void;
  open?: boolean;
  style?: CSSProperties;
  styles?: ModalSemanticStyles;
  title?: ReactNode | false;
  width?: number | string;
  zIndex?: number;
}

export type {
  BaseModalProps,
  ImperativeModalProps,
  ModalButtonProps,
  ModalConfirmConfig,
  ModalContextValue,
  ModalInstance,
  ModalProps,
  ModalSemanticClassNames,
  ModalSemanticStyles,
};
