import { findOpeningTag } from '@orvilo/html-artifact';

export const HTML_PREVIEW_SANDBOX = 'allow-scripts allow-forms allow-modals';
export const HTML_PREVIEW_MAX_LENGTH = 5 * 1024 * 1024;
export const isHtmlPreviewDocument = (content: string) =>
  /<(?:!doctype\s+html\b|html\b)/i.test(content.slice(0, 1024));
export const htmlPreviewClosed = (content: string) => /<\/html\s*>/i.test(content.slice(-1024));
export const htmlPreviewScripted = (content: string) =>
  /<script\b|\bon\w+\s*=|javascript\s*:/i.test(content);
export type HtmlPreviewStreamingMode = 'auto' | 'defer' | 'live';

export function htmlPreviewState(
  content: string,
  streaming: boolean,
  mode: HtmlPreviewStreamingMode,
) {
  if (content.length > HTML_PREVIEW_MAX_LENGTH || !isHtmlPreviewDocument(content)) return 'source';
  if (!streaming) return 'static';
  if (mode === 'defer' || (mode === 'auto' && htmlPreviewScripted(content))) return 'deferred';
  if (htmlPreviewClosed(content)) return 'static';
  return /<\/head\s*>|<body[\s>]/i.test(content) ? 'live' : 'deferred';
}

export function htmlPreviewSandbox(value = HTML_PREVIEW_SANDBOX) {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  const allowed = new Set(HTML_PREVIEW_SANDBOX.split(' '));
  if (tokens.some((token) => !allowed.has(token)))
    throw new Error('Unsupported HTML preview sandbox capability');
  return tokens.join(' ');
}

const scriptLiteral = (value: string) => JSON.stringify(value).replaceAll('<', '\\u003c');

/** Browser-native bridge, isolated memory storage and resize reporting. No host storage access. */
const bridge = (token: string, live: boolean) => `(() => {
 const token=${scriptLiteral(token)};
 for (const name of ['localStorage','sessionStorage']) {
  try { void window[name]; } catch {
   const values = new Map();
   const storage = { get length(){return values.size;}, key(i){return [...values.keys()][i] ?? null;}, getItem(k){return values.get(String(k)) ?? null;}, setItem(k,v){values.set(String(k),String(v));}, removeItem(k){values.delete(String(k));}, clear(){values.clear();} };
   try { Object.defineProperty(window,name,{configurable:true,value:storage}); } catch { /* Some engines seal the Storage property; keep rendering usable. */ }
  }
 }
 let frame;
 const report=()=>{ cancelAnimationFrame(frame); frame=requestAnimationFrame(()=>parent.postMessage({type:'orvilo-html-height',token,height:Math.max(document.body?.scrollHeight || 0,document.documentElement.scrollHeight)},'*')); };
 addEventListener('load',report);
 addEventListener('resize',report);
 addEventListener('DOMContentLoaded',()=>{new ResizeObserver(report).observe(document.documentElement);report();});
 ${
   live
     ? `
 let headNodes=[];
 const morph=(target,source)=>{
  if(target.nodeType!==source.nodeType || target.nodeName!==source.nodeName){target.replaceWith(source.cloneNode(true));return;}
  if(target.nodeType===3){if(target.nodeValue!==source.nodeValue)target.nodeValue=source.nodeValue;return;}
  if(target.nodeType!==1)return;
  for(const a of [...target.attributes])if(!source.hasAttribute(a.name))target.removeAttribute(a.name);
  for(const a of [...source.attributes])if(target.getAttribute(a.name)!==a.value)target.setAttribute(a.name,a.value);
  for(let i=0;i<source.childNodes.length;i++){
   const incoming=source.childNodes[i];
   if(incoming.nodeType===1 && incoming.id){
    const keyed=[...target.children].find(node=>node.id===incoming.id);
    if(keyed && keyed!==target.childNodes[i])target.insertBefore(keyed,target.childNodes[i] || null);
    else if(!keyed && target.childNodes[i]?.nodeType===1 && target.childNodes[i].id && target.childNodes[i].id!==incoming.id){
      target.insertBefore(incoming.cloneNode(true),target.childNodes[i]);continue;
    }
   }
   const existing=target.childNodes[i];
   if(existing)morph(existing,incoming);else target.append(incoming.cloneNode(true));
  }
  while(target.childNodes.length>source.childNodes.length)target.lastChild.remove();
 };
 addEventListener('message',event=>{
  if(event.source!==parent || event.data?.token!==token || event.data?.type!=='orvilo-html-update' || typeof event.data.content!=='string')return;
  const doc=new DOMParser().parseFromString(event.data.content,'text/html');
  // Live updates do not execute/reboot script tags; final documents use the native parser.
  doc.querySelectorAll('script').forEach(node=>node.remove());
  const incomingNodes=[...doc.head.childNodes];
  const nextHead=[];
  for(let i=0;i<incomingNodes.length;i++){
   const incoming=incomingNodes[i], previous=headNodes[i];
   if(previous && previous.nodeName===incoming.nodeName){
    if(!previous.isEqualNode(incoming))morph(previous,incoming);
    nextHead.push(previous);
   }else{
    previous?.remove();
    const next=incoming.cloneNode(true);document.head.append(next);nextHead.push(next);
   }
  }
  for(let i=incomingNodes.length;i<headNodes.length;i++)headNodes[i].remove();
  headNodes=nextHead;
  morph(document.body,doc.body);report();
 });
 addEventListener('DOMContentLoaded',()=>parent.postMessage({type:'orvilo-html-ready',token},'*'));
 `
     : ''
 }
})();`;

/** Inject before authored scripts without altering base/resource URLs or the rest of the document. */
export function buildHtmlPreviewDocument(
  content: string,
  token: string,
  live = false,
  theme?: 'light' | 'dark',
) {
  // Native content defaults precede authored CSS, which retains precedence.
  const defaults = `<style>html,body{margin:0;padding:0;${theme ? `color-scheme:${theme};` : ''}}</style>`;
  const injected = `${defaults}<script>${bridge(token, live)}</script>`;
  if (live)
    return `<!doctype html><html><head><meta charset="utf-8">${injected}</head><body></body></html>`;
  const head = findOpeningTag(content, 'head');
  if (head) return content.slice(0, head.end) + injected + content.slice(head.end);
  const html = findOpeningTag(content, 'html');
  if (html)
    return content.slice(0, html.end) + `<head>${injected}</head>` + content.slice(html.end);
  return `<!doctype html><html><head>${injected}</head><body>${content}</body></html>`;
}
