// 客户端适配器接口 - 统一两类客户端的 API 行为
import type {
  UnifiedTorrent,
  TorrentSource,
  AddTorrentOptions,
  TorrentFile,
  PeerInfo,
  TrackerStat,
} from '@shared/types';

export interface TorrentDetails {
  files: TorrentFile[];
  peers: PeerInfo[];
  trackers: TrackerStat[];
  raw: unknown;
}

export interface AdapterTestResult {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface ClientAdapter {
  readonly clientId: string;
  readonly type: 'qbittorrent' | 'transmission';

  /** 登录/建立会话 */
  login(): Promise<void>;
  /** 测试连接并返回版本 */
  test(): Promise<AdapterTestResult>;
  /** 获取版本 */
  getVersion(): Promise<string>;
  /** 获取种子列表 */
  getTorrents(): Promise<UnifiedTorrent[]>;
  /** 获取单个种子详情 */
  getTorrentDetails(hash: string): Promise<TorrentDetails>;
  /** 添加种子 */
  addTorrent(source: TorrentSource, opts: AddTorrentOptions): Promise<void>;
  /** 删除种子 */
  deleteTorrents(hashes: string[], deleteFiles: boolean): Promise<void>;
  /** 暂停 */
  pauseTorrents(hashes: string[]): Promise<void>;
  /** 恢复 */
  resumeTorrents(hashes: string[]): Promise<void>;
  /** 设置文件优先级 */
  setFilePriority(hash: string, fileIndices: number[], priority: number): Promise<void>;
  /** 增加 Tracker */
  addTracker(hash: string, urls: string[]): Promise<void>;
  /** 替换 Tracker */
  replaceTracker(hash: string, oldUrl: string, newUrl: string): Promise<void>;
  /** 删除 Tracker */
  removeTracker(hash: string, urls: string[]): Promise<void>;
  /** 获取可用空间 */
  getFreeSpace(): Promise<number>;
  /** 透传原始 API */
  raw(pathOrMethod: string, opts?: RawOpts): Promise<unknown>;
}

export interface RawOpts {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

export class AdapterError extends Error {
  code: string;
  raw?: unknown;
  constructor(message: string, code = 'ADAPTER_ERROR', raw?: unknown) {
    super(message);
    this.code = code;
    this.raw = raw;
  }
}
