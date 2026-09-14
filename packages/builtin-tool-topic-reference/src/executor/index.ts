import type { BuiltinToolContext, BuiltinToolResult } from '@orvilo/types';
import { BaseExecutor } from '@orvilo/types';

import { TopicReferenceIdentifier } from '../types';

const TopicReferenceApiName = {
  getTopicContext: 'getTopicContext',
} as const;

interface GetTopicContextParams {
  topicId: string;
}

interface TopicReferenceExecutionRuntime {
  getTopicContext: (params: GetTopicContextParams) => Promise<BuiltinToolResult>;
}

export class TopicReferenceExecutor extends BaseExecutor<typeof TopicReferenceApiName> {
  readonly identifier = TopicReferenceIdentifier;
  protected readonly apiEnum = TopicReferenceApiName;
  private runtime: TopicReferenceExecutionRuntime;

  constructor(runtime: TopicReferenceExecutionRuntime) {
    super();
    this.runtime = runtime;
  }

  getTopicContext = async (
    params: GetTopicContextParams,
    _ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    return this.runtime.getTopicContext(params);
  };
}
