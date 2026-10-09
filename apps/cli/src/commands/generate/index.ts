import type { Command } from 'commander';

import { registerAsrCommand } from './asr';

export function registerGenerateCommand(program: Command) {
  const generate = program.command('generate').alias('gen').description('Transcribe audio');

  registerAsrCommand(generate);
}
