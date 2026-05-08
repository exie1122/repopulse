export interface Repo {
  id: number;
  github_id: number;
  name: string;
  full_name: string;
  private: boolean;
  description?: string;
  html_url: string;
  tracking: boolean;
  created_at: string;
}

export interface TrafficDay {
  date: string;
  count: number;
  uniques: number;
}

export interface ReferrerRow {
  referrer: string;
  count: number;
  uniques: number;
  synced_at: string;
}

export interface PathRow {
  path: string;
  title: string;
  count: number;
  uniques: number;
  synced_at: string;
}

export interface SyncLogRow {
  id: number;
  repo_id?: number;
  repo_full_name?: string;
  synced_at: string;
  status: string;
  error?: string;
}

export interface SyncResult {
  repo_full_name: string;
  status: string;
  error?: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  name?: string;
  avatar_url: string;
}

export interface Release {
  id: number;
  repo_id: number;
  github_id: number;
  tag_name: string;
  name?: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
  total_downloads: number;
}

export interface Insight {
  kind: string;
  title: string;
  body: string;
  severity: "positive" | "warning" | "info";
}

export interface StarSnapshot {
  id: number;
  repo_id: number;
  date: string;
  count: number;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface AccessTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  interval?: number;
}

export type Page = "dashboard" | "repos" | "export" | "insights";
