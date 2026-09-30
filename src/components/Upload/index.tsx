'use client';

import { cn } from 'cn';
import {
  type ChangeEvent,
  type DragEvent,
  memo,
  type ReactNode,
  type Ref,
  useCallback,
  useRef,
  useState,
} from 'react';

import type { UploadChangeInfo, UploadProps } from './type';

const useFilePick = ({ beforeUpload, maxCount, onChange, onFiles }: UploadProps) =>
  useCallback(
    (files: File[]) => {
      let list = files;
      if (maxCount !== undefined) list = list.slice(0, maxCount);
      if (list.length === 0) return;
      onFiles?.(list);
      for (const file of list) {
        const result = beforeUpload?.(file, list);
        if (result instanceof Promise) result.catch(() => undefined);
        onChange?.({ file, fileList: list });
      }
    },
    [beforeUpload, maxCount, onChange, onFiles],
  );

const HiddenInput = ({
  accept,
  directory,
  disabled,
  inputRef,
  multiple,
  onPick,
}: Pick<UploadProps, 'accept' | 'directory' | 'disabled' | 'multiple'> & {
  inputRef: Ref<HTMLInputElement>;
  onPick: (files: File[]) => void;
}) => {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? [...event.target.files] : [];
    // Allow picking the same file again.
    event.target.value = '';
    onPick(files);
  };

  return (
    <input
      accept={accept}
      aria-hidden="true"
      disabled={disabled}
      multiple={multiple}
      ref={inputRef}
      style={{ display: 'none' }}
      tabIndex={-1}
      type={'file'}
      {...(directory ? ({ webkitdirectory: '' } as const) : {})}
      onChange={handleChange}
    />
  );
};

/**
 * Click-to-upload wrapper: children render as-is, clicking opens the file
 * picker. `beforeUpload` runs per selected file (`maxCount` truncates the list
 * first). Matches the lobehub `Upload` surface that callers rely on.
 */
const Upload = memo<UploadProps>(
  ({
    accept,
    beforeUpload,
    children,
    className,
    directory,
    disabled,
    maxCount,
    multiple,
    onChange,
    onFiles,
    openFileDialogOnClick = true,
    style,
    ...rest
  }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const pick = useFilePick({ beforeUpload, maxCount, onChange, onFiles });

    return (
      <span
        className={className}
        style={{ display: 'inline-block', ...style }}
        onClick={() => {
          if (disabled || !openFileDialogOnClick) return;
          inputRef.current?.click();
        }}
        {...rest}
      >
        <HiddenInput
          accept={accept}
          directory={directory}
          disabled={disabled}
          inputRef={inputRef}
          multiple={multiple}
          onPick={pick}
        />
        {children}
      </span>
    );
  },
);
Upload.displayName = 'Upload';

interface UploadDraggerProps extends UploadProps {
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Dropzone variant: dashed bordered area; files can be dropped anywhere on it
 * and clicking still opens the picker.
 */
const UploadDragger = memo<UploadDraggerProps>(
  ({
    accept,
    beforeUpload,
    children,
    className,
    directory,
    disabled,
    maxCount,
    multiple,
    onChange,
    onFiles,
    openFileDialogOnClick = true,
    style,
    ...rest
  }) => {
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const pick = useFilePick({ beforeUpload, maxCount, onChange, onFiles });

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      if (disabled) return;
      const files = event.dataTransfer?.files ? [...event.dataTransfer.files] : [];
      if (files.length) pick(files);
    };

    return (
      <div
        className={cn('rounded-lg border border-dashed p-4', className)}
        data-dragging={dragging || undefined}
        style={style}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (disabled || openFileDialogOnClick === false) return;
          inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        {...rest}
      >
        <HiddenInput
          accept={accept}
          directory={directory}
          disabled={disabled}
          inputRef={inputRef}
          multiple={multiple}
          onPick={pick}
        />
        {children}
      </div>
    );
  },
);
UploadDragger.displayName = 'UploadDragger';

export { Upload, UploadDragger };
export type { UploadChangeInfo, UploadProps };
export default Upload;
