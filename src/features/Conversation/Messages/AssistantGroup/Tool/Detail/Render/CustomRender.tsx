import { getBuiltinRender } from '@orvilo/builtin-tools/renders';
import { type ChatPluginPayload } from '@orvilo/types';
import { safeParseJSON } from '@orvilo/utils';
import { memo } from 'react';

import { LocalToolCapabilities } from './LocalToolCapabilities';
import { normalizeOpenCodeRender } from './normalizeOpenCode';

interface CustomRenderProps {
  content: string;
  /**
   * The real message ID (tool message ID)
   */
  messageId?: string;
  plugin?: ChatPluginPayload;
  pluginState?: any;
  /**
   * The tool call ID from the assistant message
   */
  toolCallId: string;
}

const CustomRender = memo<CustomRenderProps>(
  ({ content, messageId, plugin, pluginState, toolCallId }) => {
    const Render = getBuiltinRender(plugin?.identifier, plugin?.apiName);

    if (!Render) return null;

    const input =
      plugin?.identifier === 'opencode'
        ? normalizeOpenCodeRender(safeParseJSON(plugin?.arguments), pluginState, plugin.apiName)
        : { args: safeParseJSON(plugin?.arguments), pluginState };

    const result = (
      <div className="flex flex-col gap-3" id={toolCallId} style={{ width: '100%' }}>
        <Render
          apiName={plugin?.apiName}
          args={input.args}
          content={content}
          identifier={plugin?.identifier}
          messageId={messageId!}
          pluginState={input.pluginState}
          toolCallId={toolCallId}
        />
      </div>
    );

    return plugin?.identifier === 'orvilo-local-system' || plugin?.identifier === 'opencode' ? (
      <LocalToolCapabilities>{result}</LocalToolCapabilities>
    ) : (
      result
    );
  },
);

CustomRender.displayName = 'GroupCustomRender';

export default CustomRender;
