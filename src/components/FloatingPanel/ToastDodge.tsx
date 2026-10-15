import { useEffect, useRef } from 'react';

import { resolveToastDodge } from './geometry';

let owner: object | undefined;
const toastVars = ['--toast-shift-x', '--toast-shift-y', '--toast-width'];
export function ToastDodge() {
  const probe = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const panel = probe.current?.parentElement;
    const wrapper = panel?.parentElement;
    if (!panel || !wrapper) return;
    const token = {};
    const root = document.documentElement;
    let reserve = 0;
    const initial = getComputedStyle(wrapper);
    const x = Number.parseFloat(initial.paddingInlineEnd) || 0;
    const y = Number.parseFloat(initial.paddingBlockEnd) || 0;
    const apply = () => {
      const maxHeight = Number.parseFloat(getComputedStyle(panel).maxHeight);
      const clamped = panel.offsetHeight >= maxHeight - 0.5 ? reserve : 0;
      const dodge = resolveToastDodge({
        panelHeight: panel.offsetHeight + clamped,
        panelOffsetX: x,
        panelOffsetY: y,
        panelWidth: panel.offsetWidth,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      });
      owner = token;
      root.setAttribute('data-floating-panel-toast-dodge', '');
      reserve = dodge.reserve;
      root.style.setProperty('--toast-shift-x', `${dodge.shiftX}px`);
      root.style.setProperty('--toast-shift-y', `${dodge.shiftY}px`);
      root.style.setProperty('--toast-width', `${dodge.width}px`);
      wrapper.style.setProperty('--floating-panel-reserve-block-end', `${reserve}px`);
      wrapper.style.setProperty('--floating-panel-reserve-inline-end', `${dodge.alignInline}px`);
    };
    const observer = new ResizeObserver(apply);
    observer.observe(panel);
    window.addEventListener('resize', apply);
    apply();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
      wrapper.style.removeProperty('--floating-panel-reserve-block-end');
      wrapper.style.removeProperty('--floating-panel-reserve-inline-end');
      if (owner === token) {
        owner = undefined;
        root.removeAttribute('data-floating-panel-toast-dodge');
        for (const name of toastVars) root.style.removeProperty(name);
      }
    };
  }, []);
  return <span aria-hidden hidden ref={probe} />;
}
