import { createContext } from 'react';

interface GroupMessageContextValue {
  assistantGroupId: string;
}

export const MessageAggregationContext = createContext<GroupMessageContextValue | null>(null);
