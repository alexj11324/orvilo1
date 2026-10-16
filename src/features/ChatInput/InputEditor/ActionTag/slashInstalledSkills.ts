import type { ActionTagData } from './types';

/**
 * The installed skills the `/` menu offers. They belong to Orvilo's own
 * runtime (built-in, Orvilo, market and user Agent skills). An external CLI
 * Agent has no command for them: a pick reaches it as `/name` and the CLI
 * answers "unknown command", so its menu lists only the skills found on the
 * device. Tools stay out of the slash menu for every Agent.
 */
export const resolveSlashInstalledSkills = (
  installed: ActionTagData[],
  isHeterogeneous: boolean,
): ActionTagData[] =>
  isHeterogeneous ? [] : installed.filter((item) => item.category === 'skill');
