import { describe, expect, it } from 'vitest';

import { numberedAgentName } from './agentName';

describe('numberedAgentName', () => {
  it('returns the bare base name when it is free', () => {
    expect(numberedAgentName('Claude Code', [])).toBe('Claude Code');
    expect(numberedAgentName('Claude Code')).toBe('Claude Code');
  });

  it('trims the base name', () => {
    expect(numberedAgentName('  Codex  ', [])).toBe('Codex');
  });

  it('appends a sequential suffix on collision', () => {
    const taken = ['Claude Code'];

    expect(numberedAgentName('Claude Code', taken)).toBe('Claude Code 2');
  });

  it('keeps numbering until it finds a free slot', () => {
    const taken = ['Claude Code', 'Claude Code 2', 'Claude Code 3', 'Claude Code 5'];

    expect(numberedAgentName('Claude Code', taken)).toBe('Claude Code 4');
  });

  it('matches taken names case- and whitespace-insensitively', () => {
    const taken = ['  claude code  ', 'CLAUDE CODE 2'];

    expect(numberedAgentName('Claude Code', taken)).toBe('Claude Code 3');
  });

  it('ignores blank taken entries', () => {
    expect(numberedAgentName('Codex', ['', '   '])).toBe('Codex');
  });

  it('returns the trimmed base unchanged when it is blank', () => {
    expect(numberedAgentName('   ', ['Orvilo AI'])).toBe('');
  });
});
