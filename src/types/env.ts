import type { Redis } from 'ioredis';
import type { db } from '../db/index.js';
import type { EnvConfig } from '../config/env.js';

export interface AppEnv {
  Bindings: EnvConfig;
  Variables: {
    requestId: string;
    startTime: number;
    db: typeof db;
    redis: Redis;
    userId: string;
    userEmail: string;
  };
}
