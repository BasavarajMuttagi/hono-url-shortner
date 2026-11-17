export interface User {
  id: string;
  email: string;
  apiKey: string;
  createdAt: Date;
}

export interface URLRecord {
  id: string;
  userId: string;
  shortKey: string;
  originalUrl: string;
  title: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CachedURL {
  id: string;
  originalUrl: string;
  notFound?: boolean;
}

// Deterministic default user ID (UUIDv7) matching the Go architecture
export const DEFAULT_USER_ID = '01927e00-0000-7000-8000-000000000001';
export const DEFAULT_API_KEY = 'default-dev-api-key-secret-32-chars';
