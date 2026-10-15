import { parseToRgb } from 'polished';

/** Emoji Mart takes RGB channel lists, not arbitrary CSS color expressions. */
export function emojiRgbChannels(color: string): string {
  const { red, green, blue } = parseToRgb(color);
  return `${red}, ${green}, ${blue}`;
}

const stopMotion = `
  #root { --duration: 0ms; --duration-fast: 0ms; --duration-instant: 0ms; }
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    scroll-behavior: auto !important;
  }
`;

const shadowStyles = `
  :host, #root, input, button, .category button {
    font-family: var(--lobe-font-family);
    font-size: var(--text-sm);
    line-height: var(--text-sm--line-height);
    color: var(--orvilo-emoji-text);
  }
  .search input, .search button { font-size: var(--text-sm); }
  .search input[type='search'] {
    background-color: rgb(var(--em-rgb-input));
  }
  .search input::placeholder { color: var(--orvilo-emoji-text-secondary); }
  #root {
    --color-a: var(--orvilo-emoji-text);
    --color-b: var(--orvilo-emoji-text-secondary);
    --color-c: var(--orvilo-emoji-text-tertiary);
    --duration: var(--orvilo-emoji-duration-mid);
    --duration-fast: var(--orvilo-emoji-duration-fast);
    --duration-instant: var(--orvilo-emoji-duration-fast);
    --easing: var(--orvilo-emoji-ease-out);
  }
  :host([data-orvilo-motion-disabled]) #root {
    --duration: 0ms; --duration-fast: 0ms; --duration-instant: 0ms;
  }
  :host([data-orvilo-motion-disabled]) *,
  :host([data-orvilo-motion-disabled]) *::before,
  :host([data-orvilo-motion-disabled]) *::after {
    transition: none !important;
    animation: none !important;
    scroll-behavior: auto !important;
  }
  @media (prefers-reduced-motion: reduce) { ${stopMotion} }
`;

/** Observe the actual asynchronously inserted custom element, not the React wrapper.
 * Document styles cannot reach its open shadow tree. Restore everything we own
 * on cleanup, including during theme changes and Strict Mode effect replay. */
export function bindEmojiPickerTheme(
  container: HTMLElement,
  properties: Readonly<Record<string, string>>,
  motionEnabled: boolean,
): () => void {
  const restores = new Map<HTMLElement, () => void>();
  const bind = () => {
    for (const host of container.querySelectorAll<HTMLElement>('em-emoji-picker')) {
      if (restores.has(host) || !host.shadowRoot) continue;
      const previous = Object.keys(properties).map((key) => ({
        key,
        value: host.style.getPropertyValue(key),
        priority: host.style.getPropertyPriority(key),
      }));
      const disabled = host.getAttribute('data-orvilo-motion-disabled');
      for (const [key, value] of Object.entries(properties)) host.style.setProperty(key, value);
      host.toggleAttribute('data-orvilo-motion-disabled', !motionEnabled);
      const style = document.createElement('style');
      style.dataset.orviloEmojiRoles = '';
      const nonce = document.querySelector<HTMLStyleElement>(
        'style[data-orvilo-theme-roles]',
      )?.nonce;
      if (nonce) style.nonce = nonce;
      style.textContent = shadowStyles;
      host.shadowRoot.append(style);
      restores.set(host, () => {
        style.remove();
        for (const { key, value, priority } of previous) {
          if (value) host.style.setProperty(key, value, priority);
          else host.style.removeProperty(key);
        }
        if (disabled === null) host.removeAttribute('data-orvilo-motion-disabled');
        else host.setAttribute('data-orvilo-motion-disabled', disabled);
      });
    }
  };
  const observer = new MutationObserver(bind);
  observer.observe(container, { childList: true, subtree: true });
  bind();
  return () => {
    observer.disconnect();
    for (const restore of restores.values()) restore();
    restores.clear();
  };
}
