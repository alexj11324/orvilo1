'use client';

import { type ComponentProps, memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';

import { ProductLogo } from '@/components/Branding';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import { advanceTyping, initialTypingState, sentenceSegments } from './typing';

interface OrviloMessageProps extends Omit<ComponentProps<'div'>, 'children'> {
  fontSize?: number;
  sentences: string[];
}
function TypedSentence({ sentences, fontSize }: { fontSize: number; sentences: string[] }) {
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const prefersReducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const stopped = animationMode === 'disabled' || prefersReducedMotion;
  const [state, setState] = useState(initialTypingState);
  // Typing updates every 64ms while the source sentences stay fixed; avoid repeated grapheme segmentation.
  const parts = useMemo(() => sentences.map(sentenceSegments), [sentences]);
  const signature = JSON.stringify(sentences);
  useEffect(() => {
    setState(initialTypingState);
  }, [signature]);
  useEffect(() => {
    if (stopped || !parts.length) return;
    const lengths = parts.map((sentence) => sentence.length);
    const delay =
      state.phase === 'typing'
        ? 64
        : state.phase === 'pause'
          ? 16_000
          : state.phase === 'deleting'
            ? 32
            : 1000;
    const timer = setTimeout(() => setState((current) => advanceTyping(current, lengths)), delay);
    return () => clearTimeout(timer);
  }, [stopped, state, parts]);
  const sentence = parts[state.sentence % Math.max(1, parts.length)] ?? [];
  if (stopped) return <span>{sentences[0] ?? ''}</span>;
  return (
    <span>
      <span aria-hidden>{sentence.slice(0, state.visible).join('')}</span>
      <span className="sr-only">{sentences[state.sentence] ?? ''}</span>
      {state.phase !== 'pause' && (
        <span
          aria-hidden
          className="inline-flex items-center justify-center gap-1 align-middle"
          style={{ width: fontSize, height: fontSize }}
        >
          {[0, 1, 2].map((index) => (
            <span
              className="size-1 rounded-full bg-current motion-safe:animate-pulse motion-reduce:animate-none"
              key={index}
            />
          ))}
        </span>
      )}
    </span>
  );
}
const OrviloMessage = memo<OrviloMessageProps>(({ sentences, fontSize = 24, ...rest }) => {
  const { i18n } = useTranslation();
  return (
    <div className="flex flex-col gap-2" {...rest}>
      <ProductLogo size={fontSize * 2} />
      <h1 className="font-bold" style={{ fontSize }}>
        <TypedSentence fontSize={fontSize} key={i18n.language} sentences={sentences} />
      </h1>
    </div>
  );
});
export default OrviloMessage;
