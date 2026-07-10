// qBittorrent Web API 适配器 (v4.1+)
// 文档: https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)
import type { ClientInstance, UnifiedTorrent, TorrentSource, AddTorrentOptions, TorrentFile, PeerInfo, TrackerStat, TorrentStatus } from '@shared/types';
import type { ClientAdapter, TorrentDetails, AdapterTestResult, RawOpts } from './types.js';
import { AdapterError } from './types.js';

export class QbittorrentAdapter implements ClientAdapter {
  readonly clientId: string;
  readonly type = 'qbittorrent' as const;
  private url: string;
  private username: string;
  private password: string;
  private cookie = '';

  constructor(client: ClientInstance) {
    this.clientId = client.id;
    this.url = client.url.replace(/\/$/, '');
    this.username = client.username;
    this.password = client.password;
  }

  private async request(path: string, opts: { method?: string; body?: BodyInit; headers?: Record<string, string> } = {}): Promise<Response> {
    const headers: Record<string, string> = { ...(opts.headers || {}) };
    if (this.cookie) headers['Cookie'] = this.cookie;
    if (opts.body instanceof URLSearchParams) headers['Content-Type'] = 'application/x-www-form-urlencoded';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(`${this.url}${path}`, {
        method: opts.method || 'GET',
        headers,
        body: opts.body,
        signal: controller.signal,
      });
    } catch (e) {
      throw new AdapterError(`连接失败: ${(e as Error).name === 'AbortError' ? '请求超时' : (e as Error).message}`, 'NETWORK_ERROR', e);
    } finally {
      clearTimeout(timeout);
    }

    if (res.status === 403) {
      this.cookie = '';
      throw new AdapterError('认证被禁止（Ban）', 'FORBIDDEN');
    }
    return res;
  }

  async login(): Promise<void> {
    const form = new URLSearchParams();
    form.set('username', this.username);
    form.set('password', this.password);
    const res = await this.request('/api/v2/auth/login', { method: 'POST', body: form });

    // qBittorrent 5.2+ 登录成功返回 204 No Content（旧版返回 200 + body "Ok."）
    // 204 无 body，直接凭 Set-Cookie 判定成功
    if (res.status === 204) {
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        this.cookie = setCookie.split(';')[0];
      }
      return;
    }

    const text = await res.text();
    if (text.trim() !== 'Ok.') {
      throw new AdapterError('用户名或密码错误', 'AUTH_FAILED', text);
    }
    // 提取 cookie
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      this.cookie = setCookie.split(';')[0];
    }
  }

  private async ensureAuth(): Promise<void> {
    if (!this.cookie) await this.login();
  }

  async test(): Promise<AdapterTestResult> {
    try {
      await this.login();
      const version = await this.getVersion();
      return { ok: true, version };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async getVersion(): Promise<string> {
    await this.ensureAuth();
    const res = await this.request('/api/v2/app/version');
    return (await res.text()).trim();
  }

  async getTorrents(): Promise<UnifiedTorrent[]> {
    await this.ensureAuth();
    const res = await this.request('/api/v2/torrents/info');
    if (!res.ok) throw new AdapterError('获取种子列表失败', 'API_ERROR', await res.text());
    const list = (await res.json()) as QbTorrent[];
    return list.map((t) => this.normalize(t));
  }

  async getTorrentDetails(hash: string): Promise<TorrentDetails> {
    await this.ensureAuth();
    const [filesRes, peersRes, trackersRes, propsRes] = await Promise.all([
      this.request(`/api/v2/torrents/files?hash=${hash}`),
      this.request(`/api/v2/sync/torrentPeers?hash=${hash}`),
      this.request(`/api/v2/torrents/trackers?hash=${hash}`),
      this.request(`/api/v2/torrents/properties?hash=${hash}`),
    ]);
    const files = (await filesRes.json()) as QbFile[];
    const peersData = (await peersRes.json()) as { peers: Record<string, QbPeer> };
    const trackers = (await trackersRes.json()) as QbTracker[];
    const props = (await propsRes.json()) as QbProps;

    return {
      files: files.map((f, i) => ({
        index: i,
        name: f.name,
        size: f.size,
        progress: f.progress,
        priority: f.priority,
      })),
      peers: Object.values(peersData.peers || {}).map((p) => ({
        address: p.ip.split(':')[0],
        port: Number(p.ip.split(':')[1] || 0),
        clientName: p.client,
        progress: p.progress,
        downloadSpeed: p.dl_speed,
        uploadSpeed: p.up_speed,
        flags: p.flags,
      })),
      trackers: trackers.map((t) => ({
        url: t.url,
        status: this.trackerStatus(t.status),
        tier: t.tier,
        seederCount: t.num_seeds,
        leecherCount: t.num_leechers,
        downloadCount: t.num_downloaded,
        message: t.msg,
      })),
      raw: { files, props },
    };
  }

  async addTorrent(source: TorrentSource, opts: AddTorrentOptions): Promise<void> {
    await this.ensureAuth();
    const form = new FormData();
    if (source.type === 'magnet') {
      form.set('urls', source.value);
    } else if (source.type === 'url') {
      form.set('urls', source.value);
    } else if (source.type === 'file') {
      const buf = Buffer.from(source.base64, 'base64');
      form.set('torrents', new Blob([buf]), source.filename);
    }
    if (opts.savePath) form.set('savepath', opts.savePath);
    if (opts.category) form.set('category', opts.category);
    if (opts.paused) form.set('paused', 'true');
    if (opts.tags) form.set('tags', opts.tags.join(','));

    const res = await this.request('/api/v2/torrents/add', { method: 'POST', body: form as unknown as BodyInit });
    if (!res.ok) throw new AdapterError('添加种子失败', 'API_ERROR', await res.text());
    const text = await res.text();
    if (text.trim() !== 'Ok.' && text !== '') {
      throw new AdapterError(`添加失败: ${text}`, 'API_ERROR', text);
    }
    // 限速需在添加后用 hash 设置，此处略过（添加时 qB 无限速参数）
  }

  async deleteTorrents(hashes: string[], deleteFiles: boolean): Promise<void> {
    await this.ensureAuth();
    const form = new URLSearchParams();
    form.set('hashes', hashes.join('|'));
    form.set('deleteFiles', deleteFiles ? 'true' : 'false');
    const res = await this.request('/api/v2/torrents/delete', { method: 'POST', body: form });
    if (!res.ok) throw new AdapterError('删除种子失败', 'API_ERROR');
  }

  async pauseTorrents(hashes: string[]): Promise<void> {
    await this.ensureAuth();
    const form = new URLSearchParams();
    form.set('hashes', hashes.join('|'));
    await this.request('/api/v2/torrents/pause', { method: 'POST', body: form });
  }

  async resumeTorrents(hashes: string[]): Promise<void> {
    await this.ensureAuth();
    const form = new URLSearchParams();
    form.set('hashes', hashes.join('|'));
    await this.request('/api/v2/torrents/resume', { method: 'POST', body: form });
  }

  async setFilePriority(hash: string, fileIndices: number[], priority: number): Promise<void> {
    await this.ensureAuth();
    const form = new URLSearchParams();
    form.set('hash', hash);
    form.set('id', fileIndices.join('|'));
    form.set('priority', String(priority));
    await this.request('/api/v2/torrents/filePrio', { method: 'POST', body: form });
  }

  async addTracker(hash: string, urls: string[]): Promise<void> {
    await this.ensureAuth();
    const form = new URLSearchParams();
    form.set('hash', hash);
    form.set('urls', urls.join('\n'));
    await this.request('/api/v2/torrents/addTrackers', { method: 'POST', body: form });
  }

  async replaceTracker(hash: string, oldUrl: string, newUrl: string): Promise<void> {
    await this.ensureAuth();
    const form = new URLSearchParams();
    form.set('hash', hash);
    form.set('origUrl', oldUrl);
    form.set('newUrl', newUrl);
    const res = await this.request('/api/v2/torrents/editTracker', { method: 'POST', body: form });
    if (!res.ok) throw new AdapterError('替换 Tracker 失败', 'API_ERROR', await res.text());
  }

  async removeTracker(hash: string, urls: string[]): Promise<void> {
    await this.ensureAuth();
    const form = new URLSearchParams();
    form.set('hash', hash);
    form.set('urls', urls.join('|'));
    await this.request('/api/v2/torrents/removeTrackers', { method: 'POST', body: form });
  }

  async getFreeSpace(): Promise<number> {
    await this.ensureAuth();
    const res = await this.request('/api/v2/app/preferences');
    const prefs = (await res.json()) as { save_path: string };
    // 通过 /api/v2/transfer/info 获取不易，此处用 preferences 的临时方案
    void prefs;
    return 0;
  }

  async raw(pathOrMethod: string, opts: RawOpts = {}): Promise<unknown> {
    await this.ensureAuth();
    const qs = opts.query ? '?' + new URLSearchParams(opts.query).toString() : '';
    const res = await this.request(pathOrMethod + qs, {
      method: opts.method || 'GET',
      body: opts.body as BodyInit | undefined,
      headers: opts.headers,
    });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  }

  // ===== 映射工具 =====
  private normalize(t: QbTorrent): UnifiedTorrent {
    return {
      clientId: this.clientId,
      hash: t.hash,
      name: t.name,
      size: t.size,
      progress: t.progress,
      status: this.mapStatus(t.state),
      downloadSpeed: t.dlspeed,
      uploadSpeed: t.upspeed,
      eta: t.eta,
      ratio: t.ratio,
      savePath: t.save_path,
      addedOn: t.added_on,
      category: t.category,
      tags: t.tags ? t.tags.split(',').filter(Boolean) : [],
      trackers: t.tracker ? [t.tracker] : [],
      raw: t,
    };
  }

  private mapStatus(state: string): TorrentStatus {
    switch (state) {
      case 'downloading':
      case 'metaDL':
      case 'forcedDL':
        return 'downloading';
      case 'uploading':
      case 'forcedUP':
      case 'stalledUP':
        return 'seeding';
      case 'pausedDL':
      case 'pausedUP':
        return 'paused';
      case 'queuedDL':
      case 'queuedUP':
      case 'checkingDL':
      case 'checkingUP':
        return 'queued';
      case 'error':
        return 'error';
      case 'checkingResumeData':
      case 'checking':
        return 'checking';
      case 'stalledDL':
        return 'stalled';
      default:
        return 'stalled';
    }
  }

  private trackerStatus(s: number): string {
    return ['disabled', 'not_yet_contacted', 'working', 'updating', 'not_working'][s] || 'unknown';
  }
}

// qBittorrent 原始类型
interface QbTorrent {
  hash: string;
  name: string;
  size: number;
  progress: number;
  state: string;
  dlspeed: number;
  upspeed: number;
  eta: number;
  ratio: number;
  save_path: string;
  added_on: number;
  category: string;
  tags: string;
  tracker: string;
}
interface QbFile {
  name: string;
  size: number;
  progress: number;
  priority: number;
}
interface QbPeer {
  ip: string;
  client: string;
  progress: number;
  dl_speed: number;
  up_speed: number;
  flags: string;
}
interface QbTracker {
  url: string;
  status: number;
  tier: number;
  num_seeds: number;
  num_leechers: number;
  num_downloaded: number;
  msg: string;
}
interface QbProps {
  save_path: string;
  total_size: number;
}
