// Transmission RPC 适配器
// 文档: https://github.com/transmission/transmission/blob/main/docs/rpc-spec.md
import type { ClientInstance, UnifiedTorrent, TorrentSource, AddTorrentOptions, TorrentFile, PeerInfo, TrackerStat, TorrentStatus } from '@shared/types';
import type { ClientAdapter, TorrentDetails, AdapterTestResult, RawOpts } from './types.js';
import { AdapterError } from './types.js';

interface RpcResponse<T> {
  result?: string;
  arguments?: T;
  tag?: number;
}

export class TransmissionAdapter implements ClientAdapter {
  readonly clientId: string;
  readonly type = 'transmission' as const;
  private url: string;
  private username: string;
  private password: string;
  private sessionId = '';

  constructor(client: ClientInstance) {
    this.clientId = client.id;
    this.url = client.url.replace(/\/$/, '');
    this.username = client.username;
    this.password = client.password;
  }

  private get authHeader(): string | undefined {
    if (!this.username) return undefined;
    return 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64');
  }

  private async rpc<T = unknown>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    const body = JSON.stringify({ method, arguments: args });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(`${this.url}/transmission/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.sessionId ? { 'X-Transmission-Session-Id': this.sessionId } : {}),
          ...(this.authHeader ? { Authorization: this.authHeader } : {}),
        },
        body,
        signal: controller.signal,
      });
    } catch (e) {
      throw new AdapterError(`连接失败: ${(e as Error).name === 'AbortError' ? '请求超时' : (e as Error).message}`, 'NETWORK_ERROR', e);
    } finally {
      clearTimeout(timeout);
    }

    // 409 -> 提取 session id 重试
    if (res.status === 409) {
      const sid = res.headers.get('X-Transmission-Session-Id');
      if (sid) {
        this.sessionId = sid;
        return this.rpc<T>(method, args);
      }
    }

    if (res.status === 401) {
      throw new AdapterError('用户名或密码错误', 'AUTH_FAILED');
    }

    if (!res.ok) {
      throw new AdapterError(`RPC 错误 ${res.status}`, 'API_ERROR', await res.text());
    }

    const data = (await res.json()) as RpcResponse<T>;
    if (data.result && data.result !== 'success') {
      throw new AdapterError(`Transmission 错误: ${data.result}`, 'RPC_ERROR', data.result);
    }
    return (data.arguments as T) ?? ({} as T);
  }

  async login(): Promise<void> {
    // Transmission 用 session id，发一次请求触发
    await this.rpc('session-get');
  }

  async test(): Promise<AdapterTestResult> {
    try {
      const info = await this.rpc<TrSessionInfo>('session-get');
      return { ok: true, version: info['version'] };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async getVersion(): Promise<string> {
    const info = await this.rpc<TrSessionInfo>('session-get');
    return info['version'] || 'unknown';
  }

  async getTorrents(): Promise<UnifiedTorrent[]> {
    const args = await this.rpc<TrTorrents>('torrent-get', {
      fields: [
        'id', 'hashString', 'name', 'totalSize', 'percentDone', 'status',
        'rateDownload', 'rateUpload', 'eta', 'uploadRatio', 'downloadDir',
        'addedDate', 'downloadLimit', 'uploadLimit', 'trackers', 'labels',
        'error', 'errorString', 'isFinished', 'metadataPercentComplete',
      ],
      format: 'objects',
    } as unknown as Record<string, unknown>);
    const list = (args as unknown as { torrents: TrTorrent[] }).torrents || [];
    return list.map((t) => this.normalize(t));
  }

  async getTorrentDetails(hash: string): Promise<TorrentDetails> {
    const args = await this.rpc<TrTorrents>('torrent-get', {
      ids: [hash],
      fields: ['id', 'hashString', 'files', 'peers', 'peers6', 'trackers', 'trackersStats', 'priorities', 'wanted'],
    } as unknown as Record<string, unknown>);
    const t = ((args as unknown as { torrents: TrTorrent[] }).torrents || [])[0];
    if (!t) throw new AdapterError('种子不存在', 'NOT_FOUND');

    return {
      files: (t.files || []).map((f, i) => ({
        index: i,
        name: f.name,
        size: f.length,
        progress: f.bytesCompleted / (f.length || 1),
        priority: (t.priorities || [])[i] ?? 0,
      })),
      peers: (t.peers || []).map((p) => ({
        address: p.address,
        port: p.port,
        clientName: p.clientName,
        progress: p.progress,
        downloadSpeed: p.rateToClient,
        uploadSpeed: p.rateToPeer,
        flags: p.flagStr || '',
      })),
      trackers: (t.trackers || []).map((tr) => ({
        url: tr.announce,
        status: 'working',
        tier: tr.tier,
        seederCount: 0,
        leecherCount: 0,
        downloadCount: 0,
        message: '',
      })),
      raw: t,
    };
  }

  async addTorrent(source: TorrentSource, opts: AddTorrentOptions): Promise<void> {
    const args: Record<string, unknown> = {};
    if (source.type === 'magnet' || source.type === 'url') {
      args.filename = source.value;
    } else if (source.type === 'file') {
      args.metainfo = source.base64.replace(/^data:.*;base64,/, '');
    }
    if (opts.savePath) args['download-dir'] = opts.savePath;
    if (opts.paused) args.paused = true;
    if (opts.limit?.downloadLimit !== undefined) {
      args['downloadLimit'] = opts.limit.downloadLimit;
      args['downloadLimited'] = true;
    }
    if (opts.limit?.uploadLimit !== undefined) {
      args['uploadLimit'] = opts.limit.uploadLimit;
      args['uploadLimited'] = true;
    }
    if (opts.tags) args.labels = opts.tags;
    await this.rpc('torrent-add', args);
  }

  async deleteTorrents(hashes: string[], deleteFiles: boolean): Promise<void> {
    await this.rpc('torrent-remove', { ids: hashes, 'delete-local-data': deleteFiles });
  }

  async pauseTorrents(hashes: string[]): Promise<void> {
    await this.rpc('torrent-stop', { ids: hashes });
  }

  async resumeTorrents(hashes: string[]): Promise<void> {
    await this.rpc('torrent-start', { ids: hashes });
  }

  async setFilePriority(hash: string, fileIndices: number[], priority: number): Promise<void> {
    // Transmission priority: -1=low, 0=normal, 1=high
    const pri = priority >= 6 ? 1 : priority === 0 ? -1 : 0;
    const priorityList = fileIndices.map(() => pri);
    await this.rpc('torrent-set', { ids: [hash], 'priority-low': [], 'priority-normal': [], 'priority-high': [], files: fileIndices, priority: priorityList });
  }

  async addTracker(hash: string, urls: string[]): Promise<void> {
    const trackers = urls.map((url) => ({ announce: url }));
    await this.rpc('torrent-set', { ids: [hash], trackerAdd: trackers });
  }

  async replaceTracker(hash: string, oldUrl: string, newUrl: string): Promise<void> {
    // Transmission: trackerList 替换，或先 remove 再 add
    await this.removeTracker(hash, [oldUrl]);
    await this.addTracker(hash, [newUrl]);
  }

  async removeTracker(hash: string, urls: string[]): Promise<void> {
    // 用 ids (索引) 删除，需先查 tracker 列表匹配 URL
    const details = await this.getTorrentDetails(hash);
    const idsToRemove: number[] = [];
    details.trackers.forEach((tr, idx) => {
      if (urls.includes(tr.url)) idsToRemove.push(idx);
    });
    if (idsToRemove.length > 0) {
      await this.rpc('torrent-set', { ids: [hash], trackerRemove: idsToRemove });
    }
  }

  async getFreeSpace(): Promise<number> {
    const args = await this.rpc<TrFreeSpace>('free-space', { path: '/' } as unknown as Record<string, unknown>);
    return args['size-bytes'] || 0;
  }

  async raw(pathOrMethod: string, opts: RawOpts = {}): Promise<unknown> {
    // 对于透传，pathOrMethod 作为 RPC method
    return this.rpc(pathOrMethod, (opts.body as Record<string, unknown>) || {});
  }

  // ===== 映射工具 =====
  private normalize(t: TrTorrent): UnifiedTorrent {
    return {
      clientId: this.clientId,
      hash: t.hashString,
      name: t.name,
      size: t.totalSize,
      progress: t.percentDone,
      status: this.mapStatus(t.status, t.error, t.isFinished),
      downloadSpeed: t.rateDownload,
      uploadSpeed: t.rateUpload,
      eta: t.eta,
      ratio: t.uploadRatio,
      savePath: t.downloadDir,
      addedOn: t.addedDate,
      category: (t.labels || [])[0],
      tags: t.labels || [],
      trackers: (t.trackers || []).map((tr) => tr.announce),
      raw: t,
    };
  }

  private mapStatus(status: number, error: number, isFinished: boolean): TorrentStatus {
    if (error) return 'error';
    switch (status) {
      case 0: return isFinished ? 'seeding' : 'paused';
      case 1: return 'queued';
      case 2: return 'checking';
      case 3: return 'queued';
      case 4: return 'downloading';
      case 5: return 'seeding';
      default: return 'stalled';
    }
  }
}

interface TrSessionInfo {
  version: string;
  'rpc-version': number;
}
interface TrTorrents {
  torrents: TrTorrent[];
  removed?: string[];
}
interface TrTorrent {
  id: number;
  hashString: string;
  name: string;
  totalSize: number;
  percentDone: number;
  status: number;
  rateDownload: number;
  rateUpload: number;
  eta: number;
  uploadRatio: number;
  downloadDir: string;
  addedDate: number;
  labels?: string[];
  trackers?: { announce: string; tier: number }[];
  files?: { name: string; length: number; bytesCompleted: number }[];
  peers?: TrPeer[];
  priorities?: number[];
  wanted?: number[];
  error?: number;
  errorString?: string;
  isFinished?: boolean;
  metadataPercentComplete?: number;
}
interface TrPeer {
  address: string;
  port: number;
  clientName: string;
  progress: number;
  rateToClient: number;
  rateToPeer: number;
  flagStr?: string;
}
interface TrFreeSpace {
  path: string;
  size: number;
  total: number;
  'size-bytes'?: number;
  'total-size'?: number;
}
