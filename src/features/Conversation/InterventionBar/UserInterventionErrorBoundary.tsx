'use client';

import { safeParseJSON } from '@orvilo/utils';
import { AlertTriangle } from 'lucide-react';
import type { ErrorInfo, ReactNode } from 'react';
import { Component, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/ui/code-block';
import { useUserStore } from '@/store/user';
import { toolInterventionSelectors } from '@/store/user/selectors';

import ApprovalActions from '../Messages/AssistantGroup/Tool/Detail/Intervention/ApprovalActions';

const styles = {
  description:
    'overflow-hidden flex-1 min-w-0 text-muted-foreground text-ellipsis whitespace-nowrap',
  icon: 'flex-none text-warning-text',
  notice: 'flex gap-1.5 items-center min-w-0 py-0.5 text-sm',
  title: 'flex-none font-medium text-warning-text',
};

interface UserInterventionFallbackProps {
  actionsPortalTarget?: HTMLDivElement | null;
  apiName: string;
  assistantGroupId?: string;
  identifier: string;
  requestArgs: string;
  toolCallId: string;
  toolMessageId: string;
}

interface UserInterventionErrorBoundaryProps extends UserInterventionFallbackProps {
  children: ReactNode;
}

interface UserInterventionErrorBoundaryState {
  hasError: boolean;
}

const formatRequestArgs = (requestArgs: string) => {
  const parsed = safeParseJSON<unknown>(requestArgs);

  if (parsed === undefined) return requestArgs.trim() || '{}';

  return JSON.stringify(parsed, null, 2);
};

const UserInterventionFallback = memo<UserInterventionFallbackProps>(
  ({
    actionsPortalTarget,
    apiName,
    assistantGroupId,
    identifier,
    requestArgs,
    toolCallId,
    toolMessageId,
  }) => {
    const { t } = useTranslation('chat');
    const approvalMode = useUserStore(toolInterventionSelectors.approvalMode);
    const json = useMemo(() => formatRequestArgs(requestArgs), [requestArgs]);
    const actions = (
      <div className="flex justify-end">
        <ApprovalActions
          apiName={apiName}
          approvalMode={approvalMode}
          assistantGroupId={assistantGroupId}
          identifier={identifier}
          messageId={toolMessageId}
          toolCallId={toolCallId}
        />
      </div>
    );

    return (
      <div className="flex flex-col gap-2">
        <div className={styles.notice}>
          <AlertTriangle className={styles.icon} size={16} />
          <span className={styles.title}>{t('tool.intervention.renderFallback.title')}</span>
          <span className={styles.description}>
            {t('tool.intervention.renderFallback.description')}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {identifier} / {apiName} · {t('tool.intervention.renderFallback.rawJson')}
        </div>
        <CodeBlock wrap code={json} language="json" variant="ghost" />
        {actionsPortalTarget ? createPortal(actions, actionsPortalTarget) : actions}
      </div>
    );
  },
);

UserInterventionFallback.displayName = 'UserInterventionFallback';

class UserInterventionErrorBoundary extends Component<
  UserInterventionErrorBoundaryProps,
  UserInterventionErrorBoundaryState
> {
  public state: UserInterventionErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): UserInterventionErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[UserInterventionErrorBoundary] Caught error in intervention render:', {
      apiName: this.props.apiName,
      componentStack: errorInfo.componentStack,
      error: error.message,
      identifier: this.props.identifier,
      toolCallId: this.props.toolCallId,
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <UserInterventionFallback
          actionsPortalTarget={this.props.actionsPortalTarget}
          apiName={this.props.apiName}
          assistantGroupId={this.props.assistantGroupId}
          identifier={this.props.identifier}
          requestArgs={this.props.requestArgs}
          toolCallId={this.props.toolCallId}
          toolMessageId={this.props.toolMessageId}
        />
      );
    }

    return this.props.children;
  }
}

export default UserInterventionErrorBoundary;
