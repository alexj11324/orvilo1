'use client';

import { agentSecondaryDisplayName } from '@orvilo/types';
import { cssVar } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { PencilIcon, SparklesIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { createAgentIdentityModal } from '@/features/AgentIdentityModal';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import { useAutoName } from './useAutoName';

const AgentHeader = memo(() => {
  const { t } = useTranslation(['setting', 'common']);
  const { allowed: canEdit } = usePermission('edit_own_content');
  const isMobile = useIsMobile();

  const agentId = useAgentStore((s) => s.activeAgentId || '');
  const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId), isEqual);
  const config = useAgentStore(agentSelectors.getAgentConfigById(agentId), isEqual);
  const slug = useAgentStore(agentSelectors.getAgentSlugById(agentId));
  const { autoName, naming } = useAutoName(agentId);
  const personalName = meta.name?.trim();
  const role = meta.title?.trim();
  const suppressDuplicateRole =
    !!config?.agencyConfig?.heterogeneousProvider &&
    !!personalName &&
    !!role &&
    agentSecondaryDisplayName({ name: personalName, title: role }) === undefined;
  // Without edit rights there is nothing to prompt for, so a nameless agent
  // falls back to the plain label rather than showing an action nobody can take.
  const showNamePrompt = !personalName && canEdit;

  return (
    <div
      className="flex flex-col gap-4"
      style={{
        paddingBlock: '0 16px',

        cursor: 'default',
        // The -16px bleed pushes the colour band past the editor's container
        // padding on desktop; on mobile it runs the header past the viewport.
        marginInline: isMobile ? 0 : -16,
        width: isMobile ? '100%' : 'calc(100% + 32px)',
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <div style={{ paddingBlockEnd: 36, position: 'relative' }}>
        <div
          style={{
            background: meta.backgroundColor || 'transparent',
            borderRadius: cssVar.borderRadiusLG,
            height: meta.backgroundColor ? 160 : 80,
            marginInline: isMobile ? 0 : -16,
            width: isMobile ? '100%' : 'calc(100% + 32px)',
          }}
        />
        <div
          style={{
            background: cssVar.colorBgContainer,
            border: `4px solid ${cssVar.colorBgContainer}`,
            borderRadius: `calc(${cssVar.borderRadiusLG} + 4px)`,
            bottom: 0,
            left: 24,
            position: 'absolute',
            zIndex: 4,
          }}
        >
          <Avatar avatar={meta.avatar} name={personalName || role} shape={'square'} size={72} />
        </div>
      </div>
      {/* Identity Section — display only. Editing all three fields happens in a
          form modal; inline inputs crowded the header and left no room for a
          per-field label or error. */}
      <div className="flex flex-col flex-1 gap-2 px-6" style={{ minWidth: 0 }}>
        {/* The headline is the NAME slot. With no name there is nothing to
            headline, so it carries the action that can fix this instead of a
            placeholder pretending to be a name. The edit affordance stays hidden
            until then: naming it IS the
            next step, and offering the full identity form alongside would split
            attention between two ways to do the same thing. */}
        {showNamePrompt ? (
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <div className="truncate" style={{ color: cssVar.colorTextTertiary, fontSize: 20 }}>
              {t('settingAgent.personalName.unnamed', { ns: 'setting' })}
            </div>
            <Button
              loading={naming}
              size="sm"
              variant="ghost"
              onClick={() => {
                void autoName();
              }}
            >
              <SparklesIcon data-icon="inline-start" />
              {t('settingAgent.personalName.pickForMe', { ns: 'setting' })}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontSize: 36, fontWeight: 600 }}>
              {personalName || t('settingAgent.identity.untitled', { ns: 'setting' })}
            </div>
            {canEdit ? (
              <ActionIcon
                icon={PencilIcon}
                size={'small'}
                title={t('settingAgent.identity.edit', { ns: 'setting' })}
                onClick={() => createAgentIdentityModal(agentId)}
              />
            ) : null}
          </div>
        )}
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          {/* `Text type="secondary"` resolves to `colorTextDescription`, which antd
              maps to the TERTIARY step — too faint for the line that carries the
              agent's role. Set the secondary colour explicitly, and leave only
              the decorative `@` and the separator at tertiary. */}
          {/* A heterogeneous product name that already includes its role is
              shown once. Genuinely custom names retain the role underneath. */}
          {!suppressDuplicateRole ? (
            <div
              className="truncate"
              style={{ color: role ? cssVar.colorTextSecondary : cssVar.colorTextTertiary }}
            >
              {role || t('settingAgent.role.unset', { ns: 'setting' })}
            </div>
          ) : null}
          {slug && !suppressDuplicateRole ? (
            <div style={{ color: cssVar.colorTextTertiary }}>·</div>
          ) : null}
          {/* The tooltip only renders when a slug exists, so it can always name
              the real url rather than a `<slug>` the reader has to substitute. */}
          {slug ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span style={{ display: 'inline-flex' }}>
                      <code
                        className="font-mono rounded bg-muted px-1"
                        style={{ color: cssVar.colorTextSecondary, flex: 'none' }}
                      >
                        <span style={{ color: cssVar.colorTextTertiary }}>@</span>
                        {slug}
                      </code>
                    </span>
                  }
                />
                <TooltipContent>
                  {t('settingAgent.slug.openWith', { ns: 'setting', slug })}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
      </div>
    </div>
  );
});

export default AgentHeader;
