// API 客户端 - 统一 fetch 封装
import type {
  ClientInstance,
  UnifiedTorrent,
  Alert,
  MonitorRule,
  ActivityEvent,
  DashboardStats,
  ClientHealth,
  AddTorrentRequest,
  BatchTrackerRequest,
  BatchResult,
} from '@shared/types';

const BASE = '/api';

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({ success: false, error: '响应解析失败' }));
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `请求失败 ${res.status}`);
  }
  return json.data as T;
}

export const api = {
  // 仪表盘
  getDashboard: () => request<{ stats: DashboardStats; activities: ActivityEvent[] }>('/dashboard'),

  // 客户端
  listClients: () => request<ClientInstance[]>('/clients'),
  getClient: (id: string) => request<ClientInstance>(`/clients/${id}`),
  testClient: (data: { type: string; url: string; username: string; password: string }) =>
    request<{ ok: boolean; version?: string; error?: string }>('/clients/test', {
      method: 'POST', body: JSON.stringify(data),
    }),
  addClient: (data: Omit<ClientInstance, 'id' | 'status' | 'createdAt'>) =>
    request<ClientInstance>('/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id: string, data: Partial<ClientInstance>) =>
    request<ClientInstance>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClient: (id: string) => request<void>(`/clients/${id}`, { method: 'DELETE' }),
  reconnectClient: (id: string) => request<{ success: boolean }>(`/clients/${id}/reconnect`, { method: 'POST' }),

  // 种子
  listTorrents: (params?: { clientId?: string; status?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.clientId) qs.set('clientId', params.clientId);
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    const q = qs.toString();
    return request<{ torrents: UnifiedTorrent[]; total: number } | UnifiedTorrent[]>(`/torrents${q ? `?${q}` : ''}`) as unknown as Promise<UnifiedTorrent[]>;
  },
  getTorrentDetails: (clientId: string, hash: string) =>
    request<{ files: import('@shared/types').TorrentFile[]; peers: import('@shared/types').PeerInfo[]; trackers: import('@shared/types').TrackerStat[]; raw: unknown }>(`/torrents/${clientId}/${hash}`),
  addTorrent: (data: AddTorrentRequest) =>
    request<BatchResult[]>('/torrents', { method: 'POST', body: JSON.stringify(data) }),
  deleteTorrents: (keys: { clientId: string; hash: string }[], deleteFiles?: boolean) =>
    request<BatchResult[]>('/torrents', { method: 'DELETE', body: JSON.stringify({ keys, deleteFiles }) }),
  setTorrentState: (keys: { clientId: string; hash: string }[], action: 'pause' | 'resume') =>
    request<BatchResult[]>('/torrents/state', { method: 'PATCH', body: JSON.stringify({ keys, action }) }),
  addTracker: (clientId: string, hash: string, urls: string[]) =>
    request<void>(`/torrents/${clientId}/${hash}/trackers`, { method: 'POST', body: JSON.stringify({ urls }) }),
  replaceTracker: (clientId: string, hash: string, from: string, to: string) =>
    request<void>(`/torrents/${clientId}/${hash}/trackers`, { method: 'PUT', body: JSON.stringify({ from, to }) }),
  removeTracker: (clientId: string, hash: string, urls: string[]) =>
    request<void>(`/torrents/${clientId}/${hash}/trackers`, { method: 'DELETE', body: JSON.stringify({ urls }) }),
  setFilePriority: (clientId: string, hash: string, fileIndices: number[], priority: number) =>
    request<void>(`/torrents/${clientId}/${hash}/files/priority`, { method: 'POST', body: JSON.stringify({ fileIndices, priority }) }),

  // Tracker
  listTrackers: () => request<import('@shared/types').TrackerAggregate[]>('/trackers'),
  batchTracker: (data: BatchTrackerRequest) =>
    request<BatchResult[] | { preview: unknown[]; affected: number }>('/trackers/batch', { method: 'POST', body: JSON.stringify(data) }),

  // 监测
  listAlerts: () => request<Alert[]>('/monitor/alerts'),
  updateAlert: (id: string, status: 'open' | 'acknowledged' | 'resolved') =>
    request<void>(`/monitor/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  listRules: () => request<MonitorRule[]>('/monitor/rules'),
  updateRules: (rules: Partial<MonitorRule>[]) =>
    request<MonitorRule[]>('/monitor/rules', { method: 'PUT', body: JSON.stringify(rules) }),

  // 设置
  getSettings: () => request<Record<string, string>>('/settings'),
  updateSettings: (settings: Record<string, unknown>) =>
    request<Record<string, string>>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
};

export type ClientHealth_ = ClientHealth;
