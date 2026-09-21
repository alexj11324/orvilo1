export interface SavedViewProjectPathInput {
  id: string;
  slug?: string | null;
}

export const savedViewProjectPath = (project: SavedViewProjectPathInput): string =>
  `/project/${project.slug || project.id}`;
