import type { FtsSearchResult } from '@/database/repositories/ftsSearch';

import type { CommandMenuWorkType } from './utils/queryParser';

export interface CommandMenuWorkResult {
  createdAt: Date;
  description?: string | null;
  id: string;
  relevance: number;
  title: string;
  type: CommandMenuWorkType;
  updatedAt: Date;
}

export type CommandMenuSearchResult = FtsSearchResult | CommandMenuWorkResult;

export interface ChatMessage {
  content: string;
  id: string;
  role: 'user' | 'assistant';
}

export interface SelectedAgent {
  avatar: string;
  id: string;
  title: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export type PageType = 'theme' | 'ask-ai' | string;

export interface Context {
  name: string;
  subPath?: string;
  type: MenuContext;
}

export type MenuContext =
  | 'agent'
  | 'general'
  | 'group'
  | 'inbox'
  | 'memory'
  | 'project'
  | 'resource'
  | 'settings'
  | 'task'
  | 'team';

export type ContextType = Extract<MenuContext, 'agent' | 'group' | 'resource' | 'settings'>;
