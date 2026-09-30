'use client';

import { type CredType } from '@orvilo/types';
import { File, Globe, Key, TerminalSquare } from 'lucide-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

interface CredTypeSelectorProps {
  disabled?: boolean;
  onSelect: (type: CredType) => void;
}

const typeConfigs: Array<{
  description: string;
  icon: React.ReactNode;
  type: CredType;
}> = [
  {
    description: 'creds.typeDesc.kv-env',
    icon: <TerminalSquare size={24} />,
    type: 'kv-env',
  },
  {
    description: 'creds.typeDesc.kv-header',
    icon: <Globe size={24} />,
    type: 'kv-header',
  },
  {
    description: 'creds.typeDesc.oauth',
    icon: <Key size={24} />,
    type: 'oauth',
  },
  {
    description: 'creds.typeDesc.file',
    icon: <File size={24} />,
    type: 'file',
  },
];

const CredTypeSelector: FC<CredTypeSelectorProps> = ({ disabled, onSelect }) => {
  const { t } = useTranslation('setting');

  return (
    <div className="grid grid-cols-2 gap-4">
      {typeConfigs.map(({ type, icon, description }) => (
        <Button
          className="h-auto flex-col whitespace-normal p-4"
          disabled={disabled}
          key={type}
          type="button"
          variant="outline"
          onClick={() => {
            if (disabled) return;
            onSelect(type);
          }}
        >
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-muted">
              {icon}
            </div>
            <div className="mb-1 font-medium">{t(`creds.types.${type}`)}</div>
            <div className="text-xs text-muted-foreground">{t(description as any)}</div>
          </div>
        </Button>
      ))}
    </div>
  );
};

export default CredTypeSelector;
