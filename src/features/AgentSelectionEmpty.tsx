import { Users } from 'lucide-react';
import { type ComponentProps, memo } from 'react';
import { useTranslation } from 'react-i18next';

import SimpleEmpty from '@/components/SimpleEmpty';

interface AgentSelectionEmptyProps extends Omit<
  ComponentProps<typeof SimpleEmpty>,
  'description' | 'icon'
> {
  search?: boolean;
  variant?: 'noAvailable' | 'noSelected' | 'empty';
}

const AgentSelectionEmpty = memo<AgentSelectionEmptyProps>(
  ({ search, variant = 'empty', ...rest }) => {
    const { t } = useTranslation('home');

    let description = t('agentSelection.empty');
    if (search) {
      description = t('agentSelection.search');
    } else if (variant === 'noAvailable') {
      description = t('agentSelection.noAvailable');
    } else if (variant === 'noSelected') {
      description = t('agentSelection.noSelected');
    }

    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: '30vh', height: '100%', width: '100%' }}
      >
        <SimpleEmpty
          description={description}
          descriptionProps={{ fontSize: 14 }}
          icon={Users}
          style={{ maxWidth: 400 }}
          {...rest}
        />
      </div>
    );
  },
);

AgentSelectionEmpty.displayName = 'AgentSelectionEmpty';

export default AgentSelectionEmpty;
