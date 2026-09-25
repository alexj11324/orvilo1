const list = await (await fetch('http://localhost:9222/json')).json();
const fs = await import('fs');
const results = [];
for (const t of list.filter((x) => x.type === 'page')) {
  const ok = await Promise.race([
    new Promise((res) => {
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      ws.onopen = () =>
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: '1' } }));
      ws.onmessage = () => {
        ws.close();
        res(true);
      };
      ws.onerror = () => res(false);
    }),
    new Promise((r) => setTimeout(() => r(false), 6000)),
  ]);
  results.push(`${ok ? 'LIVE ' : 'DEAD '} ${t.url.slice(0, 70)}`);
}
fs.writeFileSync('/tmp/probetabs.txt', results.join('\n'));
process.exit(0);
