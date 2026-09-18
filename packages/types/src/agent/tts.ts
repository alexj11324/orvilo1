export type TTSServer = 'openai';

export interface OrviloAgentTTSConfig {
  showAllLocaleVoice?: boolean;
  sttLocale: 'auto' | string;
  ttsService: TTSServer;
  voice: {
    openai: string;
  };
}
