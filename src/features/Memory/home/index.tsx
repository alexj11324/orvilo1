import { Flexbox, Markdown } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import NavHeader from '@/features/NavHeader';
import { useUserMemoryStore } from '@/store/userMemory';

export default function MemoryHome() {
  const { t } = useTranslation('memory');
  const persona = useUserMemoryStore((s) => s.useFetchPersona)();
  const tags = useUserMemoryStore((s) => s.useFetchTags)();
  return (
    <Flexbox flex={1} height={'100%'}>
      <NavHeader left={<Text weight={'bold'}>{t('tab.home')}</Text>} />
      <Flexbox gap={20} padding={24} style={{ overflowY: 'auto' }}>
        <AsyncBoundary
          data={persona.data}
          empty={<Text>{t('empty.title')}</Text>}
          error={persona.error}
          isEmpty={!persona.data}
          isLoading={persona.isLoading}
          onRetry={() => void persona.mutate()}
        >
          {persona.data?.summary && <Text>{persona.data.summary}</Text>}
          {persona.data?.content && <Markdown>{persona.data.content}</Markdown>}
        </AsyncBoundary>
        <AsyncBoundary
          data={tags.data}
          error={tags.error}
          isLoading={tags.isLoading}
          onRetry={() => void tags.mutate()}
        >
          <Flexbox horizontal gap={12} wrap={'wrap'}>
            {tags.data?.roles.map((role) => (
              <Text key={role.role}>
                {role.role} ({role.count})
              </Text>
            ))}
          </Flexbox>
        </AsyncBoundary>
      </Flexbox>
    </Flexbox>
  );
}
