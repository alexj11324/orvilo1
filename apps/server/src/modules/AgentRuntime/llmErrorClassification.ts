import {
  type ClassifiedLLMError,
  createLLMErrorClassifier,
  type LLMErrorKind,
} from '@orvilo/agent-runtime';
import { ERROR_CODE_SPECS, getErrorCodeSpec } from '@orvilo/model-runtime';

export const classifyLLMError = createLLMErrorClassifier({
  errorCodeSpecs: Object.values(ERROR_CODE_SPECS),
  getErrorCodeSpec,
});

export type { ClassifiedLLMError, LLMErrorKind };
