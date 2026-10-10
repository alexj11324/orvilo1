import { registerPendingHotkeyCard } from '@orvilo/shared-tool-ui/pending-hotkeys';
import { ChevronDownIcon, CircleStop } from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';

import { useConversationResourceAccess } from '../../../../../hooks/useConversationResourceAccess';
import { useConversationStore } from '../../../../../store';
import { type ApprovalMode } from './index';

interface ApprovalActionsProps {
  apiName: string;
  approvalMode: ApprovalMode;
  assistantGroupId?: string;
  children?: ReactNode;
  identifier: string;
  label?: string;
  messageId: string;
  /**
   * Callback to be called before approve action
   * Used to flush pending saves (e.g., debounced saves) from intervention components
   */
  onBeforeApprove?: () =>
    Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;
  requestArgs?: Record<string, unknown>;
  toolCallId: string;
}

type Choice = 'approve' | 'approve-remember' | 'reject';

const ApprovalActions = memo<ApprovalActionsProps>(
  ({
    approvalMode,
    apiName,
    assistantGroupId,
    identifier,
    messageId,
    onBeforeApprove,
    toolCallId,
    children,
    requestArgs,
    label,
  }) => {
    const { t } = useTranslation('chat');
    const [choice, setChoice] = useState<Choice>('approve');
    const [reason, setReason] = useState('');
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const rejectInputRef = useRef<HTMLInputElement>(null);

    const isMessageCreating = messageId.startsWith('tmp_');
    const isAllowListMode = approvalMode === 'allow-list';
    // Workspace topics are shared: a view-only member can be LOOKING at a
    // teammate's running conversation — they must not drive its tool approvals.
    const { canUseResource } = useConversationResourceAccess();

    // Keep the existing 1/2/3 and arrow-key choices; pointer actions submit directly.
    const choices = useMemo<Choice[]>(
      () => (isAllowListMode ? ['approve', 'approve-remember', 'reject'] : ['approve', 'reject']),
      [isAllowListMode],
    );

    const [approveToolCall, rejectAndContinueToolCall, stopPendingApprovalForCard] =
      useConversationStore((s) => [
        s.approveToolCall,
        s.rejectAndContinueToolCall,
        s.stopPendingApprovalForCard,
      ]);
    const [stopping, setStopping] = useState(false);

    /**
     * "Stop here — don't continue." Sits beside the approval buttons because it answers the
     * same question the card is asking; splitting the two across the bar makes
     * the user hunt for the one they want.
     *
     * Not a rejection: rejecting writes a reason and lets the model respond,
     * stopping ends the turn outright and executes nothing.
     */
    const handleStop = useCallback(async () => {
      if (stopping || loading || isMessageCreating || !canUseResource) return;
      setStopping(true);
      try {
        await stopPendingApprovalForCard(messageId);
      } finally {
        setStopping(false);
      }
    }, [
      stopping,
      loading,
      isMessageCreating,
      canUseResource,
      stopPendingApprovalForCard,
      messageId,
    ]);
    const handleSubmit = useCallback(
      async (selectedChoice: Choice = choice) => {
        if (loading || stopping || isMessageCreating || !canUseResource) return;
        setLoading(true);
        try {
          if (selectedChoice === 'reject') {
            await rejectAndContinueToolCall(messageId, reason.trim() || undefined);
          } else {
            const editedArguments = await onBeforeApprove?.();
            await approveToolCall(messageId, assistantGroupId ?? '', {
              editedArguments,
              ...(isAllowListMode && selectedChoice === 'approve-remember'
                ? { rememberToolKey: `${identifier}/${apiName}` }
                : {}),
            });
          }
        } finally {
          setLoading(false);
        }
      },
      [
        apiName,
        approveToolCall,
        assistantGroupId,
        canUseResource,
        choice,
        identifier,
        isAllowListMode,
        isMessageCreating,
        loading,
        stopping,
        messageId,
        onBeforeApprove,
        reason,
        rejectAndContinueToolCall,
      ],
    );

    // Page-level keyboard: 1/2/↑/↓ to switch, Enter to submit. Skip while
    // typing anywhere on the page so we never hijack the main chat composer.
    // The reject input has its own onKeyDown for Enter / ↑.
    //
    // Kept fresh in a ref so the shared-arbiter registration below stays
    // mount-stable while the handler always sees current state.
    const containerRef = useRef<HTMLDivElement>(null);
    const selectChoice = useCallback((next: Choice) => {
      setChoice(next);
      if (next === 'reject' || next === 'approve-remember') setDetailsOpen(true);
      if (next === 'reject') rejectInputRef.current?.focus();
      else
        containerRef.current
          ?.querySelector<HTMLButtonElement>(`[data-approval-choice="${next}"]`)
          ?.focus();
    }, []);
    useEffect(() => {
      if (!detailsOpen) return;
      if (choice === 'reject') rejectInputRef.current?.focus();
      else if (choice === 'approve-remember')
        containerRef.current
          ?.querySelector<HTMLButtonElement>('[data-approval-choice="approve-remember"]')
          ?.focus();
    }, [detailsOpen, choice]);
    const onKeyDownRef = useRef<(e: KeyboardEvent) => void>(() => {});
    useEffect(() => {
      onKeyDownRef.current = (e: KeyboardEvent) => {
        if (e.defaultPrevented) return;
        const target = e.target as HTMLElement | null;
        if (target) {
          const tag = target.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
          // Native buttons own Enter/Space; do not submit the last keyboard choice instead.
          if (target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
        }
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        // Preserve digit shortcuts without restoring the old numbered option rows.
        if (/^[1-9]$/.test(e.key)) {
          const next = choices[Number(e.key) - 1];
          if (next) {
            e.preventDefault();
            selectChoice(next);
          }
          return;
        }
        switch (e.key) {
          case 'ArrowUp':
          case 'ArrowDown': {
            e.preventDefault();
            const idx = choices.indexOf(choice);
            const delta = e.key === 'ArrowUp' ? -1 : 1;
            selectChoice(choices[(idx + delta + choices.length) % choices.length]);
            break;
          }
          case 'Enter': {
            if (e.shiftKey) return;
            e.preventDefault();
            void handleSubmit();
            break;
          }
          // No default
        }
      };
    }, [choice, choices, handleSubmit, selectChoice]);

    // One registration per mount: the shared arbiter dispatches each keypress
    // to exactly one pending card (containment first, then newest
    // registration), so this card and a coexisting AskUserQuestion card (e.g.
    // in the global approval notification) never race on the same keystroke.
    useEffect(() => {
      if (!canUseResource) return;
      return registerPendingHotkeyCard({
        // The footer may be portaled away from the intervention body, so
        // containment covers the whole owning surface (marked with
        // `data-pending-hotkey-scope`: InterventionBar / global approval
        // card), falling back to the footer itself when rendered inline.
        contains: (node) => {
          const el = containerRef.current;
          if (!el) return false;
          return (el.closest('[data-pending-hotkey-scope]') ?? el).contains(node);
        },
        onKeyDown: (e) => onKeyDownRef.current(e),
      });
    }, [canUseResource]);

    const handleRejectInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = choices.indexOf('reject');
        const prev = choices[idx - 1];
        if (prev) selectChoice(prev);
      }
    };

    // Readers retain visible choices; every response still requires Agent Use.
    const busy = loading || stopping || isMessageCreating || !canUseResource;
    const argumentPreview = [
      requestArgs?.command,
      requestArgs?.path,
      requestArgs?.file_path,
      requestArgs?.filePath,
      requestArgs?.url,
    ].find((value): value is string => typeof value === 'string' && value.length > 0);
    const operationLabel =
      label ??
      t(`builtins.${identifier}.apiName.${apiName}`, { ns: 'plugin', defaultValue: apiName });

    return (
      <Confirmation
        data-pending-hotkey-scope
        approval={{ id: toolCallId }}
        className="gap-2"
        ref={containerRef}
        state="approval-requested"
      >
        <ConfirmationTitle>
          <ConfirmationRequest>
            {operationLabel}
            {argumentPreview && (
              <>
                {' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm break-all">
                  {argumentPreview.length > 160
                    ? `${argumentPreview.slice(0, 160)}…`
                    : argumentPreview}
                </code>
              </>
            )}{' '}
            {t('tool.intervention.confirmAction')}
          </ConfirmationRequest>
        </ConfirmationTitle>
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CollapsibleTrigger render={<Button size="sm" variant="ghost" />}>
              {t('tool.intervention.details')}
              <ChevronDownIcon className={detailsOpen ? 'size-3.5 rotate-180' : 'size-3.5'} />
            </CollapsibleTrigger>
            <ConfirmationActions>
              <ConfirmationAction
                data-approval-choice="reject"
                disabled={busy}
                variant="outline"
                onClick={() => handleSubmit('reject')}
              >
                {t('tool.intervention.reject')}
              </ConfirmationAction>
              <ConfirmationAction
                data-approval-choice="approve"
                disabled={busy}
                loading={loading}
                onClick={() => handleSubmit('approve')}
              >
                {t('tool.intervention.optionApprove')}
              </ConfirmationAction>
            </ConfirmationActions>
          </div>
          <CollapsibleContent
            keepMounted
            className="mt-3 max-h-[40vh] space-y-3 overflow-y-auto border-t border-border pt-3"
            hidden={!detailsOpen}
          >
            {children}
            <Input
              aria-label={t('tool.intervention.rejectReasonPlaceholder')}
              disabled={busy}
              placeholder={t('tool.intervention.rejectReasonPlaceholder')}
              ref={rejectInputRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onFocus={() => setChoice('reject')}
              onKeyDown={handleRejectInputKeyDown}
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ConfirmationAction disabled={busy} variant="ghost" onClick={handleStop}>
                <CircleStop data-icon="inline-start" /> {t('tool.intervention.stop')}
              </ConfirmationAction>
              {isAllowListMode && (
                <ConfirmationAction
                  className="h-auto min-h-8 whitespace-normal text-left"
                  data-approval-choice="approve-remember"
                  disabled={busy}
                  variant="outline"
                  onClick={() => handleSubmit('approve-remember')}
                >
                  {t('tool.intervention.optionApproveRemember')}
                </ConfirmationAction>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Confirmation>
    );
  },
);

export default ApprovalActions;
