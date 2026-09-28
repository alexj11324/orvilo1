// Self-contained: serialized into the renderer. Never capture text, values or IDs.
export function installEventTrace(document, element, clock = () => performance.now(), limit = 128) {
  const started = clock();
  const events = [];
  let dropped = 0;
  let click = null;
  const types = [
    'pointerdown',
    'mousedown',
    'pointerup',
    'mouseup',
    'click',
    'focusin',
    'focusout',
  ];
  const record = (event) => {
    const item = {
      ms: clock() - started,
      type: event.type,
      trusted: event.isTrusted,
      matched: event.composedPath().includes(element),
      button: event.button ?? null,
      buttons: event.buttons ?? null,
      targetTag: event.target?.tagName ?? null,
      expanded: element.getAttribute('aria-expanded'),
      connected: element.isConnected,
    };
    if (event.type === 'click' && !click) click = item;
    if (events.length < limit) events.push(item);
    else dropped++;
  };
  for (const type of types) document.addEventListener(type, record, true);
  return {
    read: () => ({ events: [...events], dropped, click }),
    stop: () => {
      for (const type of types) document.removeEventListener(type, record, true);
    },
  };
}
