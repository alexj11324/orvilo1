import { createCommand } from 'lexical';

export const INSERT_REFER_TOPIC_COMMAND = createCommand<{ topicId: string; topicTitle: string }>(
  'INSERT_REFER_TOPIC_COMMAND',
);
