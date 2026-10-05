import { cssVar } from 'antd-style';
import { FolderIcon } from 'lucide-react';
import { createElement, memo } from 'react';

interface LibIconProps {
  size?: number;
}
const LibIcon = memo<LibIconProps>(({ size = 20 }) => {
  return createElement(FolderIcon, {
    size,
    fill: cssVar.geekblue3,
    style: { color: cssVar.geekblue },
  });
});

export default LibIcon;
