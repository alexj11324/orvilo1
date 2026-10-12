import { FolderIcon } from 'lucide-react';
import { createElement, memo } from 'react';

interface LibIconProps {
  color?: string;
  size?: number;
}
const LibIcon = memo<LibIconProps>(({ color, size = 20 }) => {
  return createElement(FolderIcon, {
    size,
    fill: 'var(--ant-geekblue-3)',
    style: { color: color ?? 'var(--ant-geekblue)' },
  });
});

export default LibIcon;
