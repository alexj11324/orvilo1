/**
 * Sandbox for HTML preview iframes. Scripts, forms and modal dialogs are
 * allowed for demo pages; `allow-same-origin`, popups and top navigation are
 * deliberately omitted so previewed pages cannot reach app storage or the
 * desktop bridge.
 */
export const HTML_PREVIEW_SANDBOX = 'allow-scripts allow-forms allow-modals';

/** Beyond a few MB browsers misbehave with srcDoc; such content stays source-only. */
export const HTML_PREVIEW_MAX_LENGTH = 5 * 1024 * 1024;

/** Whether the content is a full HTML document rather than a fragment. */
export const isFullHtmlDocument = (content?: string): boolean => {
  if (!content) return false;
  const head = content.slice(0, 1024).toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
};

/** Streaming HTML is stable enough to mount once its closing tag has arrived. */
export const isHtmlContentClosed = (content?: string): boolean =>
  !!content && content.slice(-1024).toLowerCase().includes('</html>');

export const containsScript = (content?: string): boolean =>
  !!content && /<script\b/i.test(content);

/**
 * Without `allow-same-origin`, touching `localStorage` throws. Generated demos
 * use it casually, so give each frame throwaway in-memory storage instead.
 */
const STORAGE_SHIM = `(function(){function s(){var d=Object.create(null);return{get length(){return Object.keys(d).length},key:function(i){var k=Object.keys(d);return i>=0&&i<k.length?k[i]:null},getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[String(k)]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d=Object.create(null)}}}function t(n){try{window[n];return}catch(e){}try{Object.defineProperty(window,n,{configurable:true,value:s()})}catch(e){}}t('localStorage');t('sessionStorage')})();`;

const HEAD_INJECTION = `<style>html,body{margin:0;padding:0;color-scheme:light dark;}</style><script>${STORAGE_SHIM}</script>`;

/** Injects the base style and storage shim as early in the document head as possible. */
export const buildHtmlPreviewSrcDoc = (content: string): string => {
  const lower = content.toLowerCase();
  if (!lower.includes('<html'))
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${HEAD_INJECTION}</head><body>${content}</body></html>`;

  const headOpen = content.match(/<head\b[^>]*>/i);
  if (headOpen?.index !== undefined) {
    const index = headOpen.index + headOpen[0].length;
    return content.slice(0, index) + HEAD_INJECTION + content.slice(index);
  }

  const htmlOpen = content.match(/<html\b[^>]*>/i);
  if (htmlOpen?.index !== undefined) {
    const index = htmlOpen.index + htmlOpen[0].length;
    return `${content.slice(0, index)}<head>${HEAD_INJECTION}</head>${content.slice(index)}`;
  }

  return `<!DOCTYPE html><html><head>${HEAD_INJECTION}</head><body>${content}</body></html>`;
};
