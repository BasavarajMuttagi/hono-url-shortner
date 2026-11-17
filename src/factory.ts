import { createFactory } from 'hono/factory';
import type { AppEnv } from './types/env.js';

export const factory = createFactory<AppEnv>();
