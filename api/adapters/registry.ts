// 适配器注册中心 - 管理所有客户端适配器实例
import { QbittorrentAdapter } from './qbittorrent.js';
import { TransmissionAdapter } from './transmission.js';
import type { ClientAdapter } from './types.js';
import { getClient, listClients, updateClient, createAlert, createActivity } from '../db.js';
import type { ClientInstance } from '@shared/types';
import { logger } from '../logger.js';

const adapters = new Map<string, ClientAdapter>();

// ===== getTorrents TTL 缓存 =====
// dashboard / torrents / trackers 三路由共享同一份缓存，避免对下游客户端重复请求
// TTL 20s：前端轮询 15s，缓存 > 轮询间隔确保 50%+ 命中率
const TORRENT_CACHE_TTL_MS = 20000;
// 随机抖动范围 ±2s，防止 20 客户端缓存同时过期导致缓存雪崩
const TORRENT_CACHE_JITTER_MS = 2000;
// getFreeSpace 缓存 TTL（磁盘空间变化不频繁，缓存 60s）
const FREE_SPACE_CACHE_TTL_MS = 60000;

interface CacheEntry<T = unknown> {
  data: T;
  expireAt: number;
}
const torrentCache = new Map<string, CacheEntry<Awaited<ReturnType<ClientAdapter['getTorrents']>>>>();
const freeSpaceCache = new Map<string, CacheEntry<number>>();

export function invalidateTorrentCache(clientId?: string): void {
  if (clientId) {
    torrentCache.delete(clientId);
    freeSpaceCache.delete(clientId);
  } else {
    torrentCache.clear();
    freeSpaceCache.clear();
  }
}

function wrapWithCache(adapter: ClientAdapter): ClientAdapter {
  // 缓存 getTorrents
  const originalTorrents = adapter.getTorrents.bind(adapter);
  adapter.getTorrents = async () => {
    const entry = torrentCache.get(adapter.clientId);
    if (entry && entry.expireAt > Date.now()) {
      return entry.data;
    }
    const data = await originalTorrents();
    const jitter = (Math.random() - 0.5) * 2 * TORRENT_CACHE_JITTER_MS;
    torrentCache.set(adapter.clientId, {
      data,
      expireAt: Date.now() + TORRENT_CACHE_TTL_MS + jitter,
    });
    return data;
  };

  // 缓存 getFreeSpace（磁盘空间变化不频繁，30s TTL）
  const originalFreeSpace = adapter.getFreeSpace.bind(adapter);
  adapter.getFreeSpace = async () => {
    const entry = freeSpaceCache.get(adapter.clientId);
    if (entry && entry.expireAt > Date.now()) {
      return entry.data;
    }
    const data = await originalFreeSpace();
    freeSpaceCache.set(adapter.clientId, {
      data,
      expireAt: Date.now() + FREE_SPACE_CACHE_TTL_MS,
    });
    return data;
  };

  return adapter;
}

export function createAdapter(client: ClientInstance): ClientAdapter {
  let adapter: ClientAdapter;
  if (client.type === 'qbittorrent') {
    adapter = new QbittorrentAdapter(client);
  } else {
    adapter = new TransmissionAdapter(client);
  }
  return wrapWithCache(adapter);
}

export function getAdapter(clientId: string): ClientAdapter | undefined {
  if (adapters.has(clientId)) return adapters.get(clientId);
  const client = getClient(clientId);
  if (!client) return undefined;
  const adapter = createAdapter(client);
  adapters.set(clientId, adapter);
  return adapter;
}

export async function refreshAdapter(clientId: string): Promise<ClientAdapter | undefined> {
  const client = getClient(clientId);
  if (!client) {
    adapters.delete(clientId);
    return undefined;
  }
  const adapter = createAdapter(client);
  adapters.set(clientId, adapter);
  return adapter;
}

export function removeAdapter(clientId: string): void {
  adapters.delete(clientId);
  torrentCache.delete(clientId);
}

export async function connectClient(clientId: string): Promise<boolean> {
  const adapter = getAdapter(clientId);
  if (!adapter) return false;
  try {
    const result = await adapter.test();
    if (result.ok) {
      updateClient(clientId, { status: 'online', version: result.version, lastSeen: Date.now() });
      logger.info({ clientId, version: result.version }, '客户端已连接');
      return true;
    }
    updateClient(clientId, { status: 'offline' });
    return false;
  } catch (e) {
    logger.warn({ clientId, err: (e as Error).message }, '客户端连接失败');
    updateClient(clientId, { status: 'offline' });
    return false;
  }
}

export async function connectAll(): Promise<void> {
  const clients = listClients();
  await Promise.all(clients.map((c) => connectClient(c.id)));
}

export async function testConnection(data: { type: string; url: string; username: string; password: string }): Promise<{ ok: boolean; version?: string; error?: string }> {
  const tempClient: ClientInstance = {
    id: 'temp',
    name: 'temp',
    type: data.type as 'qbittorrent' | 'transmission',
    url: data.url,
    username: data.username,
    password: data.password,
    status: 'offline',
    createdAt: 0,
  };
  const adapter = createAdapter(tempClient);
  return adapter.test();
}

export function recordActivity(clientId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    createActivity(clientId, eventType, payload);
  } catch (e) {
    logger.error({ err: (e as Error).message }, '记录活动失败');
  }
}

export function recordAlert(clientId: string, level: 'info' | 'warning' | 'error' | 'critical', event: string, detail: string): void {
  createAlert({ clientId, level, event, detail });
}
