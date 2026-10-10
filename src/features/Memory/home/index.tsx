import { Markdown } from '@lobehub/ui';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import NavHeader from '@/features/NavHeader';
import { useUserMemoryStore } from '@/store/userMemory';

export default function MemoryHome() {
  const { t } = useTranslation('memory');
  const persona = useUserMemoryStore((s) => s.useFetchPersona)();
  const tags = useUserMemoryStore((s) => s.useFetchTags)();
  return (
    <div className="flex flex-col flex-1 h-full">
      <NavHeader left={<div className="font-bold text-foreground">{t('tab.home')}</div>} />
      <div className="flex flex-col gap-5 p-6 overflow-y-auto">
        <AsyncBoundary
          data={persona.data}
          empty={<div className="text-foreground">{t('empty.title')}</div>}
          error={persona.error}
          isEmpty={!persona.data}
          isLoading={persona.isLoading}
          onRetry={() => void persona.mutate()}
        >
          {persona.data?.summary && <div className="text-foreground">{persona.data.summary}</div>}
          {persona.data?.content && <Markdown>{persona.data.content}</Markdown>}
        </AsyncBoundary>
        <AsyncBoundary
          data={tags.data}
          error={tags.error}
          isLoading={tags.isLoading}
          onRetry={() => void tags.mutate()}
        >
          <div className="flex flex-row flex-wrap gap-3">
            {tags.data?.roles.map((role) => (
              <div className="text-foreground" key={role.role}>
                {role.role} ({role.count})
              </div>
            ))}
          </div>
        </AsyncBoundary>
      </div>
    </div>
  );
}
