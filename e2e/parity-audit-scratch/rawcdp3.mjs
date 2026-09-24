const ws = new WebSocket('ws://localhost:9222/devtools/page/02364FDE9F082790C99CB6171D14246E');
const fs = await import('fs');
ws.onopen = () =>
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: '1+1' } }));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id === 1) {
    fs.writeFileSync('/tmp/rawcdp3-out.txt', 'ALIVE ' + JSON.stringify(m.result));
    process.exit(0);
  }
};
ws.onerror = () => {
  fs.writeFileSync('/tmp/rawcdp3-out.txt', 'WS-ERROR');
  process.exit(1);
};
setTimeout(() => {
  fs.writeFileSync('/tmp/rawcdp3-out.txt', 'TIMEOUT');
  process.exit(2);
}, 15000);
