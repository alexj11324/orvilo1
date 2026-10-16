import { type UserMemoryData } from '@orvilo/prompts';

import { BaseFirstUserContentProvider } from '../base/BaseFirstUserContentProvider';
import { type PipelineContext, type ProcessorOptions } from '../types';

declare module '../types' {
  interface PipelineContextMetadataOverrides {
    userMemoryInjected?: boolean;
  }
}

export interface UserMemoryInjectorConfig {
  enabled?: boolean;
  /** User memories data */
  memories?: UserMemoryData;
}

export interface MemoryContext {
  /** Effective memory effort for the current request */
  effort?: 'high' | 'low' | 'medium';
}

/** Retained constructor for historical callers; platform memory injection is retired. */
export class UserMemoryInjector extends BaseFirstUserContentProvider {
  readonly name = 'UserMemoryInjector';

  constructor(_config: UserMemoryInjectorConfig, options: ProcessorOptions = {}) {
    super(options);
  }

  protected buildContent(_context: PipelineContext): string | null {
    return null;
  }
}
