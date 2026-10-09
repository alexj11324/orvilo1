import { memo, useMemo } from 'react';

import { ToolOutput } from '@/components/ai-elements/tool';

import Arguments from '../Arguments';

interface FallbackArgumentRenderProps {
  content: string;
  errorText?: string;
  requestArgs?: string;
  toolCallId: string;
}

export const FallbackArgumentRender = memo<FallbackArgumentRenderProps>(
  ({ toolCallId, content, errorText, requestArgs }) => {
    const output = useMemo(() => {
      try {
        const parsed = JSON.parse(content);
        // Keep a literal JSON null visible rather than treating it as absent output.
        return parsed === null ? 'null' : parsed;
      } catch {
        return content;
      }
    }, [content]);

    return (
      <div className="space-y-4" id={toolCallId}>
        <Arguments arguments={requestArgs} />
        {(content !== '' || errorText) && <ToolOutput errorText={errorText} output={output} />}
      </div>
    );
  },
);
