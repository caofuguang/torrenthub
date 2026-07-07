// 适配器注册中心 - 管理所有客户端适配器实例
import { QbittorrentAdapter } from './qbittorrent.js';
import { TransmissionAdapter } from './transmission.js';
import type { ClientAdapter } from './types.js';
import { getClient, listClients, updateClient, createAlert, createActivity } from '../db.js';
import type { ClientInstance } from '@shared/types';
import { logger } from '../logger.js';

const adapters = new Map<string, ClientAdapter>();

export function createAdapter(client: ClientInstance): ClientAdapter {
  if (client.type === 'qbittorrent') {
    return new QbittorrentAdapter(client);
  }
  return new TransmissionAdapter(client);
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
