/**
 * Errors raised by the skill *read* path.
 *
 * The import / parse error classes that used to live here went with the retired
 * Skill-management chain (`docs/development/hidden-surface-retirement.md`).
 */
export class SkillResourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillResourceError';
  }
}
