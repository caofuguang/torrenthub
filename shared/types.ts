// TorrentHub 共享类型定义 - 前后端通用

export type ClientType = 'qbittorrent' | 'transmission';

export type ClientStatus = 'online' | 'offline' | 'degraded';

export interface ClientInstance {
  id: string;
  name: string;
  type: ClientType;
  url: string;
  username: string;
  password: string;
  status: ClientStatus;
  version?: string;
  createdAt: number;
  lastSeen?: number;
}

export type TorrentStatus =
  | 'downloading'
  | 'seeding'
  | 'paused'
  | 'queued'
  | 'error'
  | 'checking'
  | 'stalled';

export interface TorrentFile {
  index: number;
  name: string;
  size: number;
  progress: number;
  priority: number; // 0 = skip, 1 = normal, 6 = high
}

export interface PeerInfo {
  address: string;
  port: number;
  clientName: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  flags: string;
}

export interface TrackerStat {
  url: string;
  status: string;
  tier: number;
  seederCount: number;
  leecherCount: number;
  downloadCount: number;
  message: string;
}

export interface UnifiedTorrent {
  clientId: string;
  hash: string;
  name: string;
  size: number;
  progress: number; // 0-1
  status: TorrentStatus;
  downloadSpeed: number;
  uploadSpeed: number;
  eta: number; // seconds
  ratio: number;
  savePath: string;
  addedOn: number;
  category?: string;
  tags: string[];
  trackers: string[];
  files?: TorrentFile[];
  peers?: PeerInfo[];
  trackerStats?: TrackerStat[];
  raw?: unknown;
}

export type TorrentSource =
  | { type: 'magnet'; value: string }
  | { type: 'url'; value: string }
  | { type: 'file'; filename: string; base64: string };

export interface AddTorrentOptions {
  savePath?: string;
  paused?: boolean;
  limit?: { downloadLimit?: number; uploadLimit?: number };
  category?: string;
  tags?: string[];
}

export interface AddTorrentRequest extends AddTorrentOptions {
  source: TorrentSource;
  clientIds: string[];
}

export interface BatchTrackerRequest {
  torrentKeys: { clientId: string; hash: string }[];
  operation: 'add' | 'replace' | 'remove';
  urls?: string[];
  replace?: { from: string; to: string };
  previewOnly?: boolean;
}

export interface TrackerAggregate {
  url: string;
  torrentCount: number;
  totalSeeders: number;
  totalLeechers: number;
  clients: string[];
}

export type AlertLevel = 'info' | 'warning' | 'error' | 'critical';

export interface Alert {
  id: string;
  clientId: string;
  clientName?: string;
  level: AlertLevel;
  event: string;
  detail: string;
  status: 'open' | 'acknowledged' | 'resolved';
  createdAt: number;
  resolvedAt?: number;
}

export interface MonitorRule {
  id: string;
  name: string;
  ruleType: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface ActivityEvent {
  id: string;
  clientId: string;
  clientName?: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface DashboardStats {
  totalTorrents: number;
  activeTorrents: number;
  totalDownloadSpeed: number;
  totalUploadSpeed: number;
  totalDiskUsed: number;
  totalDiskFree: number;
  clients: ClientHealth[];
}

export interface ClientHealth {
  id: string;
  name: string;
  type: ClientType;
  status: ClientStatus;
  version?: string;
  torrentCount: number;
  downloadSpeed: number;
  uploadSpeed: number;
  freeSpace: number;
  totalSpace?: number;
  healthScore: number; // 0-100
}

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  raw?: unknown;
}

export interface BatchResult {
  success: boolean;
  clientId: string;
  hash: string;
  error?: string;
}

// WebSocket 消息
export type WSMessage =
  | { type: 'torrent:update'; payload: Partial<UnifiedTorrent> & { clientId: string; hash: string } }
  | { type: 'alert:new'; payload: Alert }
  | { type: 'client:status'; payload: { clientId: string; status: ClientStatus } }
  | { type: 'activity'; payload: ActivityEvent };
