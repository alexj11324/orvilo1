import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { ChevronRight } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { pluginHelpers, useToolStore } from '@/store/tool';
import { toolSelectors } from '@/store/tool/selectors';
import { shinyTextStyles } from '@/styles';

import { getToolDisplayName } from '../../toolDisplayNames';
import { extractToolKeyword } from './extractToolKeyword';

export const styles = {
  aborted: 'text-foreground-quaternary',
  keyword:
    'overflow-hidden flex-initial min-w-0 font-mono text-xs leading-5 text-foreground-tertiary text-ellipsis',
  root: 'overflow-hidden flex min-w-0 items-center gap-1.5 text-sm leading-5.5 text-foreground-description whitespace-nowrap',
  label: 'flex-none',
  standalone: 'overflow-hidden flex-initial min-w-0 text-ellipsis',
};

interface ToolTitleProps {
  apiName: string;
  args?: Record<string, unknown>;
  identifier: string;
  isAborted?: boolean;
  isLoading?: boolean;
  partialArgs?: Record<string, unknown>;
}

const isCJK = (value: string) => /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(value);

/**
 * Collapsed tool row title. When a command has a step description it stands
 * alone — the action label ("执行代码") adds nothing next to "恢复登录态", and
 * showing both at different sizes reads as a glitch, so the description takes
 * the label's typography. Command-like keywords (program name, file basename)
 * keep the "<label> <keyword>" shape in the smaller code font.
 */
const ToolTitle = memo<ToolTitleProps>(
  ({ identifier, apiName, args, partialArgs, isLoading, isAborted }) => {
    const { t } = useTranslation('plugin');

    const pluginMeta = useToolStore(toolSelectors.getMetaById(identifier), isEqual);
    const pluginTitle = pluginHelpers.getPluginTitle(pluginMeta);

    // Builtin (and hetero-agent) tools have per-API action labels under
    // `builtins.<identifier>.apiName.<apiName>`; everything else falls back to
    // the workflow-summary display name (MCP short labels / title-cased
    // apiName), prefixed with the plugin title when we actually know it.
    const actionLabel = t(`builtins.${identifier}.apiName.${apiName}`, { defaultValue: '' });

    const effectiveArgs = args ?? partialArgs;
    const keyword = useMemo(() => extractToolKeyword(effectiveArgs), [effectiveArgs]);

    // Only command step descriptions can replace the action. Resource titles,
    // queries, and paths can also contain CJK text but do not say what the tool
    // is doing (for example, creating versus updating a Linear issue).
    const hasCommand = ['command', 'cmd', 'script'].some(
      (key) => typeof effectiveArgs?.[key] === 'string' && effectiveArgs[key].trim(),
    );
    const isStandaloneDescription =
      hasCommand &&
      !!keyword &&
      isCJK(keyword) &&
      keyword === extractToolKeyword({ description: effectiveArgs?.description });

    return (
      <div className={cn(styles.root, isAborted && styles.aborted)}>
        {isStandaloneDescription ? (
          <span className={cn(styles.standalone, isLoading && shinyTextStyles.shinyText)}>
            {keyword}
          </span>
        ) : (
          <>
            <span className={cn(styles.label, isLoading && shinyTextStyles.shinyText)}>
              {actionLabel || (
                <>
                  {pluginTitle && (
                    <>
                      <span>{pluginTitle}</span>
                      <ChevronRight />
                    </>
                  )}
                  <span>{getToolDisplayName(apiName)}</span>
                </>
              )}
            </span>
            {keyword && <span className={styles.keyword}>{keyword}</span>}
          </>
        )}
      </div>
    );
  },
);

export default ToolTitle;
