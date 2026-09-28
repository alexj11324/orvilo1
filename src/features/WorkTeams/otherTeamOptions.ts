export const otherTeamOptions = (
  teams: Array<{ id: string; name: string }>,
  currentTeamId: string,
): Array<{ label: string; value: string }> =>
  teams
    .filter((team) => team.id !== currentTeamId)
    .map((team) => ({ label: team.name, value: team.id }));
