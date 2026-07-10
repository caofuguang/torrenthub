// 仪表盘聚合统计路由
import { Router } from 'express';
import { listClients, listActivities } from '../db.js';
import { getAdapter } from '../adapters/registry.js';
import { mapWithConcurrency } from '../concurrency.js';
import type { DashboardStats, ClientHealth } from '@shared/types';
import { logger } from '../logger.js';

const router = Router();
// 20 客户端规模下的并发上限
const DASHBOARD_CONCURRENCY = 8;

router.get('/', async (_req, res) => {
  const clients = listClients();

  let totalTorrents = 0;
  let activeTorrents = 0;
  let totalDownloadSpeed = 0;
  let totalUploadSpeed = 0;
  let totalDiskFree = 0;

  // 并发拉取（限制并发数），替代无限制的 Promise.allSettled
  const results = await mapWithConcurrency(clients, async (c) => {
    const adapter = getAdapter(c.id);
    if (!adapter || c.status === 'offline') {
      return {
        id: c.id, name: c.name, type: c.type, status: c.status, version: c.version,
        torrentCount: 0, downloadSpeed: 0, uploadSpeed: 0, freeSpace: 0, healthScore: 0,
      } as ClientHealth;
    }
    try {
      // getTorrents 与 getFreeSpace 并行，减少串行等待
      const [torrents, freeSpace] = await Promise.all([
        adapter.getTorrents(),
        adapter.getFreeSpace().catch(() => 0),
      ]);
      const downloadSpeed = torrents.reduce((s, t) => s + t.downloadSpeed, 0);
      const uploadSpeed = torrents.reduce((s, t) => s + t.uploadSpeed, 0);
      const active = torrents.filter((t) => t.status === 'downloading' || t.status === 'seeding').length;

      let score = 100;
      const errored = torrents.filter((t) => t.status === 'error').length;
      score -= errored * 5;
      if (torrents.length > 0 && active === 0) score -= 20;
      score = Math.max(0, Math.min(100, score));

      totalTorrents += torrents.length;
      activeTorrents += active;
      totalDownloadSpeed += downloadSpeed;
      totalUploadSpeed += uploadSpeed;
      totalDiskFree += freeSpace;

      return {
        id: c.id, name: c.name, type: c.type, status: 'online' as const, version: c.version,
        torrentCount: torrents.length, downloadSpeed, uploadSpeed, freeSpace, healthScore: score,
      } as ClientHealth;
    } catch (e) {
      logger.warn({ clientId: c.id, err: (e as Error).message }, '仪表盘拉取失败');
      return {
        id: c.id, name: c.name, type: c.type, status: 'degraded' as const, version: c.version,
        torrentCount: 0, downloadSpeed: 0, uploadSpeed: 0, freeSpace: 0, healthScore: 30,
      } as ClientHealth;
    }
  }, DASHBOARD_CONCURRENCY);

  const healths: ClientHealth[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') healths.push(r.value);
  }

  const stats: DashboardStats = {
    totalTorrents,
    activeTorrents,
    totalDownloadSpeed,
    totalUploadSpeed,
    totalDiskUsed: 0,
    totalDiskFree,
    clients: healths,
  };

  res.json({ success: true, data: { stats, activities: listActivities(20) } });
});

export default router;
