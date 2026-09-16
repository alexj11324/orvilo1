export type StarterMode = 'agent' | 'group' | 'video' | 'research' | 'image' | null;

export interface HomeInputState {
  homeInputLoading: boolean;
  inputActiveMode: StarterMode;
}

export const initialHomeInputState: HomeInputState = {
  homeInputLoading: false,
  inputActiveMode: null,
};
