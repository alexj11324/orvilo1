import { AGENT_CHAT_TOPIC_URL } from '@orvilo/const';
import { cssVar } from 'antd-style';
import { Link2 } from 'lucide-react';
import { memo } from 'react';

import { Button } from '@/components/ui/button';
import { type MemorySource } from '@/database/repositories/userMemory';
import Link from '@/libs/router/Link';

const SourceLink = memo<{ source?: MemorySource | null }>(({ source }) => {
  if (!source?.agentId || !source.id) return;

  const title = source.title || source.id?.replace('tpc_', '').slice(0, 8);

  return (
    <Link
      href={AGENT_CHAT_TOPIC_URL(source.agentId, source.id)}
      style={{
        flex: 1,
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      <Button
        size="sm"
        title={title}
        variant="ghost"
        style={{
          flex: 1,
          maxWidth: '100%',
          overflow: 'hidden',
        }}
      >
        <Link2 data-icon="inline-start" />
        <div className="truncate" style={{ color: cssVar.colorTextSecondary }}>
          {title}
        </div>
      </Button>
    </Link>
  );
});

export default SourceLink;
