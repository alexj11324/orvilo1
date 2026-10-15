import { nativeCodeLanguages } from '../languageCatalog';
import { loadProfessionalCodeKernel } from './kernel';

/** Browser-only real-kernel fixture, run serially by the integration owner.
 * It mounts all selector modes, checks the actual professional mode resolver,
 * then reconfigures the mounted state. This is not visual/token-tree acceptance.
 */
export async function verifyProfessionalLanguageCoverage(host: HTMLElement) {
  const construct = await loadProfessionalCodeKernel();
  const results: { value: string; hasGrammar: boolean; reconfigured: boolean }[] = [];
  for (const { value } of nativeCodeLanguages) {
    const child = document.createElement('div');
    host.append(child);
    const code = 'first line\nsecond line 🛰️\n';
    const instance = construct(child, {
      value: code,
      mode: 'plain',
      readOnly: false,
      tabSize: 2,
      indentWithTabs: false,
      lineNumbers: true,
      theme: 'default',
      useHistory: true,
    });
    try {
      const hasGrammar = instance.optionHelper.mode2Extension(value).length > 0;
      if (hasGrammar !== (value !== 'plain' && value !== 'mermaid')) {
        throw new Error(`Unexpected professional grammar availability: ${value}`);
      }
      const before = instance.view.state;
      instance.setOption('mode', value);
      if (instance.options.mode !== value || instance.getValue() !== code) {
        throw new Error(`Professional mode activation failed: ${value}`);
      }
      const reconfigured = instance.view.state !== before;
      if (!reconfigured) throw new Error(`Professional state not reconfigured: ${value}`);
      results.push({ value, hasGrammar, reconfigured });
    } finally {
      instance.destroy();
      child.remove();
    }
  }
  if (results.length !== 75 || results.filter(({ hasGrammar }) => hasGrammar).length !== 73) {
    throw new Error('Professional catalog coverage changed');
  }
  return results;
}
