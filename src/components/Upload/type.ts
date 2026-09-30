import type { ComponentProps, Ref } from 'react';

interface UploadChangeInfo {
  file: File;
  fileList: File[];
}

interface UploadProps extends Omit<ComponentProps<'span'>, 'onChange'> {
  accept?: string;
  beforeUpload?: (file: File, fileList: File[]) => boolean | Promise<boolean | void> | void;
  disabled?: boolean;
  maxCount?: number;
  multiple?: boolean;
  onChange?: (info: UploadChangeInfo) => void;
  onFiles?: (files: File[]) => void;
  /** Set to `false` to render a passive drop zone with no click-to-open. */
  openFileDialogOnClick?: boolean;
  ref?: Ref<HTMLElement>;
}

export type { UploadChangeInfo, UploadProps };
