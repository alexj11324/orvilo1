import { MCP } from '@lobehub/icons';
import { memo } from 'react';

import { Badge } from '@/components/reui/badge';

interface MCPTagProps {
  showIcon?: boolean;
  showText?: boolean;
}

const MCPTag = memo<MCPTagProps>(({ showIcon = true, showText = true }) => {
  return (
    <Badge size="sm" variant="secondary">
      {showIcon && <MCP />}
      {showText && 'Model Context Protocol'}
    </Badge>
  );
});

export default MCPTag;
