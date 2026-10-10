import { FolderIcon } from 'lucide-react';
import { createElement, memo } from 'react';

interface LibIconProps {
  size?: number;
}
const LibIcon = memo<LibIconProps>(({ size = 20 }) => {
  return createElement(FolderIcon, {
    size,
    fill: 'var(--ant-geekblue-3)',
    style: { color: 'var(--ant-geekblue)' },
  });
});

export default LibIcon;
