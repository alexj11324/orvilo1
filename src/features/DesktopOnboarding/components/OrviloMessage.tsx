import { type TypewriterEffectProps } from '@lobehub/ui/awesome';
import { TypewriterEffect } from '@lobehub/ui/awesome';
import { LoadingDots } from '@lobehub/ui/chat';
import { type ComponentProps, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ProductLogo } from '@/components/Branding';

interface OrviloMessageProps extends Omit<ComponentProps<'div'>, 'children'> {
  fontSize?: number;
  sentences: TypewriterEffectProps['sentences'];
}

const OrviloMessage = memo<OrviloMessageProps>(({ sentences, fontSize = 24, ...rest }) => {
  const { i18n } = useTranslation();
  const locale = i18n.language;

  return (
    <div className="flex flex-col gap-2" {...rest}>
      <ProductLogo size={fontSize * 2} />
      <h1 className="font-bold" style={{ fontSize }}>
        <TypewriterEffect
          cursorCharacter={<LoadingDots size={fontSize} variant={'pulse'} />}
          cursorFade={false}
          deletePauseDuration={1000}
          deletingSpeed={32}
          hideCursorWhileTyping={'afterTyping'}
          key={locale}
          pauseDuration={16_000}
          sentences={sentences}
          typingSpeed={64}
        />
      </h1>
    </div>
  );
});

export default OrviloMessage;
