import type { EnvConfig } from '../config/env.js';

export interface AppEnv {
  Bindings: EnvConfig;
  Variables: {
    requestId: string;
    startTime: number;
  };
}
