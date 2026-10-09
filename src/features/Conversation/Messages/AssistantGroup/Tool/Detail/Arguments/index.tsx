import { WrapText } from 'lucide-react';
import { parse } from 'partial-json';
import type { ReactNode } from 'react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { ToolInput } from '@/components/ai-elements/tool';
import {
  CodeBlock,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLanguage,
} from '@/components/ui/code-block';

export interface ArgumentsProps {
  actions?: ReactNode;
  arguments?: string;
  loading?: boolean;
}

const Arguments = memo<ArgumentsProps>(({ arguments: args = '', loading, actions }) => {
  const { t } = useTranslation('chat');
  const [wrap, setWrap] = useState(false);
  const displayArgs = useMemo(() => {
    if (!args.trim()) return {};
    try {
      return parse(args);
    } catch {
      return args;
    }
  }, [args]);
  const code = typeof displayArgs === 'string' ? displayArgs : JSON.stringify(displayArgs, null, 2);

  return (
    <ToolInput input={displayArgs}>
      <CodeBlock
        code={code ?? ''}
        language={typeof displayArgs === 'string' ? 'text' : 'json'}
        streaming={loading}
        style={{ maxHeight: 300, overflow: 'auto' }}
        wrap={wrap}
      >
        <CodeBlockHeader>
          <CodeBlockLanguage />
          <ActionIcon
            active={wrap}
            icon={WrapText}
            size="small"
            title={t(
              wrap ? 'workingPanel.review.wordWrap.disable' : 'workingPanel.review.wordWrap.enable',
            )}
            onClick={() => setWrap((value) => !value)}
          />
          <CodeBlockCopyButton />
          {actions}
        </CodeBlockHeader>
      </CodeBlock>
    </ToolInput>
  );
});

export default Arguments;
