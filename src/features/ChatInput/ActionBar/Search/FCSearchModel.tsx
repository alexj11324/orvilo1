import { createStaticStyles, cssVar, cx } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import InfoTooltip from '@/components/InfoTooltip';
import { useAgentStore } from '@/store/agent';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';

import { useAgentId } from '../../hooks/useAgentId';
import { useUpdateAgentConfig } from '../../hooks/useUpdateAgentConfig';
import FunctionCallingModelSelect from './FunctionCallingModelSelect';

const styles = createStaticStyles(({ css }) => ({
  check: css`
    margin-inline-start: 12px;
    font-size: 16px;
    color: ${cssVar.colorPrimary};
  `,
  content: css`
    flex: 1;
    width: 230px;
  `,
  description: css`
    width: 200px;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  title: css`
    font-size: 14px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
}));

interface FCSearchModelProps {
  disabled?: boolean;
}

const FCSearchModel = memo<FCSearchModelProps>(({ disabled }) => {
  const { t } = useTranslation('chat');
  const agentId = useAgentId();
  const { updateAgentChatConfig } = useUpdateAgentConfig();
  const searchFCModel = useAgentStore((s) =>
    chatConfigByIdSelectors.getSearchFCModelById(agentId)(s),
  );
  return (
    <div className="flex flex-row justify-between gap-4 p-2">
      <div className="flex flex-row items-center gap-1">
        <div className={cx('flex flex-col', styles.title)}>{t('search.searchModel.title')}</div>
        <InfoTooltip title={t('search.searchModel.desc')} />
      </div>
      <FunctionCallingModelSelect
        disabled={disabled}
        value={searchFCModel}
        style={{
          maxWidth: 160,
          width: 160,
        }}
        onChange={async (value) => {
          if (disabled) return;
          await updateAgentChatConfig({ searchFCModel: value });
        }}
      />
    </div>
  );
});

export default FCSearchModel;
