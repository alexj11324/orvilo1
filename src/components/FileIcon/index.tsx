import { memo } from 'react';

import { mimeTypeMap } from './config';
import FileTypeIcon from './FileTypeIcon';
import MaterialFileTypeIcon from './MaterialFileTypeIcon';

export { default as FileTypeIcon, type FileTypeIconProps } from './FileTypeIcon';
export {
  default as MaterialFileTypeIcon,
  type MaterialFileTypeIconProps,
} from './MaterialFileTypeIcon';

interface FileListProps {
  fileName: string;
  fileType?: string;
  isDirectory?: boolean;
  size?: number;
  variant?: 'raw' | 'file' | 'folder';
}

const FileIcon = memo<FileListProps>(({ fileName, size, variant = 'raw', isDirectory }) => {
  if (isDirectory)
    return (
      <MaterialFileTypeIcon
        fallbackUnknownType={false}
        filename={fileName}
        size={size}
        type={'folder'}
        variant={variant}
      />
    );

  if (Object.keys(mimeTypeMap).some((key) => fileName?.toLowerCase().endsWith(`.${key}`))) {
    const ext = fileName.split('.').pop()?.toLowerCase() as string;

    return (
      <FileTypeIcon
        color={mimeTypeMap[ext]}
        filetype={ext?.toUpperCase()}
        size={size}
        type={'file'}
      />
    );
  }

  return <MaterialFileTypeIcon filename={fileName} size={size} type={'file'} variant={variant} />;
});

export default FileIcon;
