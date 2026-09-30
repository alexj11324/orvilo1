'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';

import OpeningMessage from './OpeningMessage';
import OpeningQuestions from './OpeningQuestions';

const AgentOpening = memo(() => {
  const { t } = useTranslation('setting');

  const items = [
    {
      children: <OpeningMessage />,
      desc: t('settingOpening.openingMessage.desc'),
      label: t('settingOpening.openingMessage.title'),
    },
    {
      children: <OpeningQuestions />,
      desc: t('settingOpening.openingQuestions.desc'),
      label: t('settingOpening.openingQuestions.title'),
    },
  ];

  return (
    <FieldGroup className="gap-6" style={{ maxWidth: 1024, width: '100%' }}>
      {items.map((item) => (
        <Field key={item.label}>
          <FieldLabel>{item.label}</FieldLabel>
          {item.desc && <FieldDescription>{item.desc}</FieldDescription>}
          {item.children}
        </Field>
      ))}
    </FieldGroup>
  );
});

export default AgentOpening;
