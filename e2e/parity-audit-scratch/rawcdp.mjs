// Raw CDP test: connect to a PAGE target (not browser) and evaluate
const list = await (await fetch('http://localhost:9222/json')).json();
const page =
  list.find((t) => t.type === 'page' && t.url.includes('linear.app')) ||
  list.find((t) => t.type === 'page');
console.log('target:', page.url.slice(0, 80));
const ws = new WebSocket(page.webSocketDebuggerUrl);
const deadline = Date.now() + 20000;
ws.onopen = () => {
  ws.send(
    JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'document.title' } }),
  );
};
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id === 1) {
    console.log('TITLE:', JSON.stringify(m.result?.result?.value));
    ws.close();
    process.exit(0);
  }
};
ws.onerror = (e) => {
  console.log('WS ERROR');
  process.exit(1);
};
setTimeout(() => {
  console.log('TIMEOUT waiting for page CDP');
  process.exit(2);
}, 20000);
