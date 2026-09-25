const list = await (await fetch('http://localhost:9222/json')).json();
const page =
  list.find((t) => t.type === 'page' && t.url.includes('linear.app')) ||
  list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let out = [];
ws.onopen = () =>
  ws.send(
    JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'document.title' } }),
  );
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id === 1) {
    out.push('TITLE:' + JSON.stringify(m.result?.result?.value));
    require('fs').writeFileSync('/tmp/rawcdp-out.txt', out.join('\n'));
    process.exit(0);
  }
};
setTimeout(() => {
  require('fs').writeFileSync('/tmp/rawcdp-out.txt', 'TIMEOUT');
  process.exit(2);
}, 18000);
