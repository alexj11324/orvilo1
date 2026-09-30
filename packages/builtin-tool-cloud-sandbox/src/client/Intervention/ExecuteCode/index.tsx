'use client';

import type { BuiltinInterventionProps } from '@orvilo/types';
import { memo } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';

interface ExecuteCodeParams {
  code: string;
  language?: 'javascript' | 'python' | 'typescript';
}

const languageDisplayNames: Record<string, string> = {
  javascript: 'JavaScript',
  python: 'Python',
  typescript: 'TypeScript',
};

const ExecuteCode = memo<BuiltinInterventionProps<ExecuteCodeParams>>(({ args }) => {
  const { code, language = 'python' } = args;
  const displayLanguage = languageDisplayNames[language] || language;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row justify-between">
        <div>Execute code in cloud sandbox</div>
        <div className="text-muted-foreground" style={{ fontSize: 12 }}>
          {displayLanguage}
        </div>
      </div>
      {code && (
        <CodeBlock
          wrap
          code={code}
          language={language}
          style={{ padding: '4px 8px' }}
          variant={'default'}
        />
      )}
    </div>
  );
});

export default ExecuteCode;
