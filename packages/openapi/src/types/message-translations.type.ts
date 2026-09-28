import { z } from 'zod';

// ==================== Message Translation Query Types ====================

/**
 * Message translation query request parameters
 */
export interface MessageTranslateQueryRequest {
  messageId: string;
}

export const MessageTranslateQueryRequestSchema = z.object({
  messageId: z.string().min(1, 'message id is required'),
});

/**
 * Message translation params request parameters
 */
export type MessageTranslateParams = MessageTranslateQueryRequest;

// ==================== Message Translation Update Types ====================

/**
 * Update translation info request parameters
 */
export type MessageTranslateInfoUpdate = MessageTranslateQueryRequest & {
  content?: string;
  from?: string;
  to: string;
};

export const MessageTranslateInfoUpdateSchema = z.object({
  content: z.string().optional(),
  from: z.string().optional(),
  to: z.string().min(1, 'target language is required, e.g. en-US, zh-CN'),
});

// ==================== Message Translation Response Types ====================

/**
 * Message translation response parameters
 */
export interface MessageTranslateResponse {
  clientId: string | null;
  content: string | null;
  from: string | null;
  id: string;
  to: string | null;
  userId: string;
}
