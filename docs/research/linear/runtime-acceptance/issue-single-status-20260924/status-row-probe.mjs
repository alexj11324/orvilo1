const port = 9232;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url.startsWith('app://renderer'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pend = new Map();
ws.addEventListener('message', (e) => {
  const d = JSON.parse(e.data);
  if (pend.has(d.id)) {
    pend.get(d.id)(d);
    pend.delete(d.id);
  }
});
const send = (m, p = {}) =>
  new Promise((r) => {
    const i = ++id;
    pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
const ev = async (x) => {
  const raw = await send('Runtime.evaluate', {
    awaitPromise: true,
    expression: x,
    returnByValue: true,
  });
  if (!raw.result) throw new Error(JSON.stringify(raw.error));
  if (raw.result.exceptionDetails)
    throw new Error(raw.result.exceptionDetails.exception?.description);
  return raw.result.result.value;
};
await send('Emulation.setDeviceMetricsOverride', {
  deviceScaleFactor: 2,
  height: 900,
  mobile: false,
  width: 1440,
});
await ev(`location.href="app://renderer/ws-useragenttes/task/VYG-2"`);
await new Promise((r) => setTimeout(r, 6000));
await ev(
  `(async()=>{for(let i=0;i<60&&!document.querySelector('[data-task-workflow-state]');i++)await new Promise(r=>setTimeout(r,250));await new Promise(r=>setTimeout(r,800));})()`,
);
const rail = await ev(
  `(()=>{const label=[...document.querySelectorAll('span')].find(s=>s.textContent.trim()==='属性');const sec=label.parentElement;return {rows:[...sec.querySelectorAll(':scope > div > *')].map(r=>r.innerText.replace(/\\s+/g,' ').trim()).filter(Boolean), workflowNodes:document.querySelectorAll('[data-task-workflow-state]').length}})()`,
);
console.info('RAIL', JSON.stringify(rail));
const box = await ev(
  `(()=>{const r=document.querySelector('[data-task-workflow-state]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
await new Promise((r) => setTimeout(r, 1200));
console.info(
  'TOOLTIP',
  await ev(
    `(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let t,o=[];while((t=w.nextNode()))if(/执行/.test(t.textContent))o.push(t.textContent.trim().slice(0,60));return o.join(' | ')||'none'})()`,
  ),
);
await send('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: box.x,
  y: box.y,
  button: 'left',
  clickCount: 1,
});
await send('Input.dispatchMouseEvent', {
  type: 'mouseReleased',
  x: box.x,
  y: box.y,
  button: 'left',
  clickCount: 1,
});
await new Promise((r) => setTimeout(r, 900));
console.info(
  'MENU',
  await ev(
    `[...document.querySelectorAll('[role=menu]')].map(m=>[...m.querySelectorAll('[role=menuitem]')].map(i=>i.innerText.trim()).join(' / ')).join(' ## ')||'none'`,
  ),
);
const shot = await send('Page.captureScreenshot', { format: 'png' });
(await import('node:fs')).writeFileSync(process.argv[2], Buffer.from(shot.result.data, 'base64'));
await send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  key: 'Escape',
  code: 'Escape',
  windowsVirtualKeyCode: 27,
});
await send('Input.dispatchKeyEvent', {
  type: 'keyUp',
  key: 'Escape',
  code: 'Escape',
  windowsVirtualKeyCode: 27,
});
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
await new Promise((r) => setTimeout(r, 500));
console.info(
  'AFTER',
  await ev(
    `document.querySelectorAll('[role=menu]').length+' menus; state='+document.querySelector('[data-task-workflow-state]')?.getAttribute('data-task-workflow-state')`,
  ),
);
ws.close();
