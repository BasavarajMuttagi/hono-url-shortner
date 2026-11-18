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

export interface ClickEvent {
  url_id: string;
  short_key: string;
  timestamp: string;
  ip_hash: string;
  country: string;
  city: string;
  browser: string;
  os: string;
  device_type: string;
  referrer: string;
}

export interface AnalyticsTimeseries {
  date: string;
  clicks: number;
}

export interface AnalyticsBreakdown {
  name: string;
  count: number;
}

export interface AnalyticsResponse {
  urlId: string;
  shortKey: string;
  totalClicks: number;
  uniqueVisitors: number;
  timeseries: AnalyticsTimeseries[];
  topCountries: AnalyticsBreakdown[];
  topReferrers: AnalyticsBreakdown[];
  devices: AnalyticsBreakdown[];
  browsers: AnalyticsBreakdown[];
  operatingSystems: AnalyticsBreakdown[];
}
