// detect which env var the devin binary checks
import { execFileSync } from 'child_process';
const candidates = [
  'DEVIN_DIR',
  'DEVIN_REMOTE_STATE_DIR',
  '__COG_BASH_ENV_SOURCED',
  '__COG_SHELL_INTEGRATION_SCRIPT',
  'DEVIN_DISABLE_HISTEXPAND',
];
for (const v of candidates) {
  const env = { ...process.env, PATH: process.env.HOME + '/.local/bin:' + process.env.PATH };
  delete env[v];
  try {
    const out = execFileSync('devin', ['auth', 'status'], { env, timeout: 10000 }).toString();
    console.log(v, '→ OK-ish:', out.split('\n')[0]);
  } catch (e) {
    const s = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
    console.log(v, '→', s.split('\n').filter(Boolean)[0]?.slice(0, 80));
  }
}
process.exit(0);
