export const duplicateCanonicalOptions = (
  tasks: Array<{
    duplicateOfTaskId?: string | null;
    id: string;
    identifier?: string | null;
    name?: string | null;
  }>,
  currentTaskId: string,
): Array<{ label: string; value: string }> =>
  tasks
    .filter((task) => task.id !== currentTaskId && !task.duplicateOfTaskId)
    .map((task) => ({
      label: task.name?.trim() || task.identifier || task.id,
      value: task.id,
    }));
