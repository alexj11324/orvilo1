import { LocalSystemRenders } from '@orvilo/builtin-tool-local-system/client';
import type { BuiltinRenderProps } from '@orvilo/types';
import { useMemo } from 'react';

import { ToolOutput } from '@/components/ai-elements/tool';

import { parseOpenCodeGlob } from './glob';

const ListFiles = LocalSystemRenders.listFiles;
export const OpenCodeGlob = (props: BuiltinRenderProps) => {
  const files = useMemo(() => parseOpenCodeGlob(props.content || ''), [props.content]);
  if (!files || props.pluginError)
    return <ToolOutput errorText={props.pluginError?.message} output={props.content} />;
  return <ListFiles {...props} pluginState={{ files }} />;
};
