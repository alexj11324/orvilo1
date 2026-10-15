import { createCommand } from 'lexical';

export interface InsertLocalFileTagPayload {
  isDirectory?: boolean;
  name: string;
  path: string;
}

export const INSERT_LOCAL_FILE_TAG_COMMAND = createCommand<InsertLocalFileTagPayload>(
  'INSERT_LOCAL_FILE_TAG_COMMAND',
);
