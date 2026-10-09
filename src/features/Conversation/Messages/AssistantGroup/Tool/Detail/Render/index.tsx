import { getBuiltinRender } from '@orvilo/builtin-tools/renders';
import { type ChatPluginPayload } from '@orvilo/types';
import { memo } from 'react';

import CustomRender from './CustomRender';
import { FallbackArgumentRender } from './FallbacktArgumentRender';

interface ToolRenderProps {
  content: string;
  errorText?: string;
  messageId?: string;
  plugin?: ChatPluginPayload;
  pluginState?: any;
  showCustomToolRender?: boolean;
  toolCallId: string;
}

const ToolRender = memo<ToolRenderProps>(
  ({ showCustomToolRender, content, errorText, messageId, plugin, pluginState, toolCallId }) => {
    const hasCustomRender = !!getBuiltinRender(plugin?.identifier, plugin?.apiName);

    if (hasCustomRender && showCustomToolRender) {
      return (
        <CustomRender
          content={content}
          messageId={messageId}
          plugin={plugin}
          pluginState={pluginState}
          toolCallId={toolCallId}
        />
      );
    }

    return (
      <FallbackArgumentRender
        content={content}
        errorText={errorText}
        requestArgs={plugin?.arguments}
        toolCallId={toolCallId}
      />
    );
  },
);

ToolRender.displayName = 'ToolResultRender';

export default ToolRender;
