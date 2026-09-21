import type { Command } from 'commander';

import { registerAsrCommand } from './asr';
import { registerTtsCommand } from './tts';

export function registerGenerateCommand(program: Command) {
  const generate = program
    .command('generate')
    .alias('gen')
    .description('Generate speech or transcribe audio');

  registerTtsCommand(generate);
  registerAsrCommand(generate);
}
