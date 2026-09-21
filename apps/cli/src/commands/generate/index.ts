import type { Command } from 'commander';

import { registerAsrCommand } from './asr';
import { registerTextCommand } from './text';
import { registerTtsCommand } from './tts';

export function registerGenerateCommand(program: Command) {
  const generate = program
    .command('generate')
    .alias('gen')
    .description('Generate text, speech, or transcribe audio');

  registerTextCommand(generate);
  registerTtsCommand(generate);
  registerAsrCommand(generate);
}
