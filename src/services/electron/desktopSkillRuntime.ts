import type { ExecScriptActivatedSkill } from '@orvilo/builtin-tool-skills';

class DesktopSkillRuntimeService {
  async resolveExecutionDirectory(
    _activatedSkills?: ExecScriptActivatedSkill[],
  ): Promise<string | undefined> {
    return undefined;
  }

  async resolveReferenceFullPath(_params: {
    path: string;
    skillId?: string;
    skillName?: string;
  }): Promise<string | undefined> {
    return undefined;
  }
}

export const desktopSkillRuntimeService = new DesktopSkillRuntimeService();
