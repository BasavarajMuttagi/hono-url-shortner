import { env } from '../src/config/env.js';

/**
 * Test Fixtures & Constants
 * Dynamically resolves seed user IDs and API keys from environment configuration (.env).
 */

// Monotonic UUIDv7 test fixture
export const TEST_USER_ID = env.SEED_USER_ID;

// Test API Key fixture used across Vitest suites
export const TEST_API_KEY = env.SEED_API_KEY;

// Test user email fixture
export const TEST_USER_EMAIL = env.SEED_USER_EMAIL;
