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
await ev(
  `(async()=>{for(let i=0;i<60&&!/Agent Testing User/.test(document.body.innerText);i++)await new Promise(r=>setTimeout(r,250));await new Promise(r=>setTimeout(r,800));})()`,
);
const box = await ev(
  `(()=>{const i=[...document.querySelectorAll('input')].find(i=>i.value==='12月1日'&&i.getBoundingClientRect().left<880);let p=i.parentElement;while(p.getBoundingClientRect().width<=i.getBoundingClientRect().width+8)p=p.parentElement;const r=p.getBoundingClientRect();window.__chip=p;return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
);
const icons = `(()=>[...window.__chip.querySelectorAll('svg')].map(s=>{let v=true;for(let n=s;n&&n!==window.__chip;n=n.parentElement){const c=getComputedStyle(n);if(c.visibility==='hidden'||+c.opacity===0||c.display==='none')v=false}return (v&&s.getBoundingClientRect().width?'VISIBLE':'hidden')+':'+(s.closest('[class*=clear]')?'clear':'glyph')}).join(','))()`;
console.info('REST', await ev(icons));
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
await new Promise((r) => setTimeout(r, 400));
console.info('HOVER', await ev(icons));
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
await new Promise((r) => setTimeout(r, 800));
console.info(
  'POPUP',
  await ev(
    `(()=>{const d=[...document.querySelectorAll('.ant-picker-dropdown')].filter(e=>e.getBoundingClientRect().width>0);if(!d.length)return 'none';const el=d[0];const clearBtn=[...el.querySelectorAll('[title]')].map(e=>e.getAttribute('title'));return el.innerText.replace(/\\s+/g,' ').slice(0,80)+' | titles='+JSON.stringify(clearBtn)})()`,
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
    `[...document.querySelectorAll('.ant-picker-dropdown')].filter(e=>e.getBoundingClientRect().width>0).length + ' open; value=' + [...document.querySelectorAll('input')].filter(i=>/月/.test(i.value)).map(i=>i.value).join(',')`,
  ),
);
ws.close();
