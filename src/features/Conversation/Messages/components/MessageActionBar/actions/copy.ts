import { Copy } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { cleanSpeakerTag } from '@/store/chat/utils/cleanSpeakerTag';
import { unescapeMarkdown } from '@/store/chat/utils/unescapeMarkdown';
import { copyToClipboard } from '@/utils/clipboard';

import { defineAction } from '../defineAction';

export const copyAction = defineAction({
  key: 'copy',
  useBuild: (ctx) => {
    const { t } = useTranslation('common');

    return useMemo(() => {
      const raw =
        ctx.role === 'group' ? (ctx.contentBlock?.content ?? ctx.data.content) : ctx.data.content;
      const content = ctx.role === 'user' ? unescapeMarkdown(cleanSpeakerTag(raw)) : raw;

      return {
        handleClick: async () => {
          await copyToClipboard(content);
          toast.success(t('copySuccess'));
        },
        icon: Copy,
        key: 'copy',
        label: t('copy'),
      };
    }, [t, ctx.role, ctx.data.content, ctx.contentBlock?.content]);
  },
});
