import { FolderIcon } from 'lucide-react';
import { createElement, memo } from 'react';

interface LibIconProps {
  color?: string;
  size?: number;
}
const LibIcon = memo<LibIconProps>(({ color, size = 20 }) => {
  return createElement(FolderIcon, {
    size,
    fill: 'var(--palette-geekblue-3)',
    style: { color: color ?? 'var(--palette-geekblue-6)' },
  });
});

export default LibIcon;
