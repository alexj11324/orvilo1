import isEqual from 'fast-deep-equal';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors, dbMessageSelectors } from '@/store/chat/selectors';
import { safeParseJSON } from '@/utils/safeParseJSON';

import ToolRender from './ToolRender';

const ToolUI = () => {
  const messageId = useChatStore(chatPortalSelectors.toolMessageId);
  const message = useChatStore(dbMessageSelectors.getDbMessageById(messageId || ''), isEqual);
  // make sure the message and id is valid
  if (!messageId || !message) return;

  const { plugin } = message;

  // make sure the plugin and identifier is valid
  if (!plugin || !plugin.identifier) return;

  const args = safeParseJSON(plugin.arguments);

  if (!args) return;

  return (
    <div className="flex flex-col flex-1 h-[100%] px-3" style={{ overflow: 'auto' }}>
      <ToolRender />
    </div>
  );
};

export default ToolUI;
