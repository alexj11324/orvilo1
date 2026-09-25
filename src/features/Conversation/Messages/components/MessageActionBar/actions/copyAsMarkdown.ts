import { copyToClipboard } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import { FileText } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { cleanSpeakerTag } from '@/store/chat/utils/cleanSpeakerTag';
import { unescapeMarkdown } from '@/store/chat/utils/unescapeMarkdown';

import { defineAction } from '../defineAction';

/**
 * `Copy as markdown` — the reference's non-mutating copy action for agent
 * replies. Unlike plain `copy` (which hands over the stored content verbatim),
 * this normalizes the message's markdown source: echoed speaker tags are
 * stripped and escaped punctuation (`\*`, `\[`) is unescaped so the result
 * pastes cleanly into markdown tooling.
 *
 * Assistant-authored content only — user messages already get the same
 * normalization inside `copyAction`, so offering it there would duplicate it.
 */
export const copyAsMarkdownAction = defineAction({
  key: 'copyAsMarkdown',
  useBuild: (ctx) => {
    const { t } = useTranslation('common');

    return useMemo(() => {
      if (ctx.role === 'user') return null;

      const raw =
        ctx.role === 'group' ? (ctx.contentBlock?.content ?? ctx.data.content) : ctx.data.content;
      // `content` is not guaranteed to be a string on every message shape —
      // the transcript builder guards the same way.
      const markdown = unescapeMarkdown(cleanSpeakerTag(typeof raw === 'string' ? raw : ''));

      if (!markdown.trim()) return null;

      return {
        handleClick: async () => {
          await copyToClipboard(markdown);
          toast.success(t('copySuccess'));
        },
        icon: FileText,
        key: 'copyAsMarkdown',
        label: t('copyAsMarkdown'),
      };
    }, [t, ctx.role, ctx.data.content, ctx.contentBlock?.content]);
  },
});
