export type RedisConfig = {
  database?: number;
  enabled: boolean;
  password?: string;
  prefix: string;
  tls: boolean;
  tlsCA?: string;
  url: string;
  username?: string;
};
