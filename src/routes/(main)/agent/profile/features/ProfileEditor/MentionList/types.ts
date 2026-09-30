import { type ISlashMenuOption } from '@lobehub/editor';
import { type API } from '@orvilo/prompts';

export type MentionEntityType = 'collection' | 'api';

export interface MentionMetadata {
  apis?: API[];
  description?: string;
  identifier: string;
  instructions?: string;
  label?: string;
  pluginIdentifier?: string;
  pluginType?: string;
  type?: MentionEntityType;
}

type MentionMenuItem = ISlashMenuOption;

export type MentionListOption = MentionMenuItem & {
  description?: string;
  metadata?: MentionMetadata;
};
