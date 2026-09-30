import { type ChatMessageError } from '@orvilo/types';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import ErrorContent from '@/features/Conversation/ChatItem/components/ErrorContent';
import type { ErrorAlertProps } from '@/features/Conversation/components/ErrorAlert';
import dynamic from '@/libs/next/dynamic';

const loading = () => <Skeleton style={{ width: 300 }} />;

const SetupGuide = dynamic(() => import('../OllamaSetupGuide'), { loading, ssr: false });

interface OllamaError {
  code: string | null;
  message: string;
  param?: any;
  type: string;
}

interface OllamaErrorResponse {
  error: OllamaError;
}

interface OllamaBizErrorProps {
  alertError?: ErrorAlertProps;
  error?: ChatMessageError | null;
  id: string;
}

const OllamaBizError = memo<OllamaBizErrorProps>(({ alertError, error, id }) => {
  const errorBody: OllamaErrorResponse = (error as any)?.body;

  const errorMessage = errorBody.error?.message;

  // error of not enable model or not set the CORS rules
  if (errorMessage?.includes('Failed to fetch')) {
    return <SetupGuide id={id} />;
  }

  return <ErrorContent error={alertError} id={id} />;
});

export default OllamaBizError;
