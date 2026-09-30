import { type API } from '@orvilo/prompts';

import type { SidebarMenuItemData } from '@/features/NavPanel/components/SidebarDropdownMenu';

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

type MentionMenuItem = SidebarMenuItemData;

export type MentionListOption = MentionMenuItem & {
  description?: string;
  metadata?: MentionMetadata;
};
