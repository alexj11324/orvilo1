import { AGENT_CHAT_TOPIC_URL } from '@orvilo/const';
import { cssVar } from 'antd-style';
import { Link2 } from 'lucide-react';
import { memo } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { type MemorySource } from '@/database/repositories/userMemory';
import Link from '@/libs/router/Link';

const SourceLink = memo<{ source?: MemorySource | null }>(({ source }) => {
  if (!source?.agentId || !source.id) return;

  const title = source.title || source.id?.replace('tpc_', '').slice(0, 8);

  return (
    <Link
      className={buttonVariants({ size: 'sm', variant: 'ghost' })}
      href={AGENT_CHAT_TOPIC_URL(source.agentId, source.id)}
      title={title}
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
    </Link>
  );
});

export default SourceLink;
