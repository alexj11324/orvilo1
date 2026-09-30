import { cx } from 'antd-style';
import { FileText, FolderIcon, LockIcon } from 'lucide-react';

import FileIcon from '@/components/FileIcon';
import { Input } from '@/components/ui/input';
import { SimpleTooltip } from '@/components/ui/tooltip';

import { styles } from './styles';
import TruncatedFileName from './TruncatedFileName';

interface FileListItemNameProps {
  emoji?: string | null;
  fallbackName: string;
  fileType: string;
  inputRef: any;
  isFolder: boolean;
  isPage: boolean;
  /**
   * Private to its creator, so no other workspace member can open it. A library
   * mixes both scopes (the Resources mode filter is deliberately skipped inside
   * one), which is exactly where the distinction needs to be visible.
   */
  isPrivate?: boolean;
  isRenaming: boolean;
  name: string;
  onRenameCancel: () => void;
  onRenameConfirm: () => void;
  onRenamingValueChange: (value: string) => void;
  privateTooltip: string;
  renamingValue: string;
}

const FileListItemName = ({
  emoji,
  fallbackName,
  fileType,
  inputRef,
  isFolder,
  isPage,
  isPrivate,
  isRenaming,
  name,
  onRenameCancel,
  onRenameConfirm,
  onRenamingValueChange,
  privateTooltip,
  renamingValue,
}: FileListItemNameProps) => (
  <div className={cx('flex flex-row items-center', styles.nameContainer)}>
    <div
      className="flex flex-col items-center justify-center"
      style={{ fontSize: 24, marginInline: 8, width: 24 }}
    >
      {isPrivate ? (
        <SimpleTooltip title={privateTooltip}>
          <div className="flex flex-col items-center justify-center h-[24px] w-[24px]">
            <span className="anticon" role="img">
              <LockIcon fill={'transparent'} height={24} size={24} width={24} />
            </span>
          </div>
        </SimpleTooltip>
      ) : isFolder ? (
        <span className="anticon" role="img">
          <FolderIcon fill={'transparent'} height={24} size={24} width={24} />
        </span>
      ) : isPage ? (
        emoji ? (
          <span style={{ fontSize: 24 }}>{emoji}</span>
        ) : (
          <div className="flex flex-col items-center justify-center h-[24px] w-[24px]">
            <span className="anticon" role="img">
              <FileText fill={'transparent'} height={24} size={24} width={24} />
            </span>
          </div>
        )
      ) : (
        <FileIcon fileName={name} fileType={fileType} size={24} />
      )}
    </div>
    {isRenaming && isFolder ? (
      <Input
        ref={inputRef}
        style={{ flex: 1, maxWidth: 400 }}
        value={renamingValue}
        onBlur={onRenameConfirm}
        onChange={(e) => onRenamingValueChange(e.target.value)}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onRenameConfirm();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onRenameCancel();
          }
        }}
      />
    ) : (
      <TruncatedFileName className={styles.name} name={name || fallbackName} />
    )}
  </div>
);

export default FileListItemName;
