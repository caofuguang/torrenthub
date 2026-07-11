// Tracker 工作台路由
import { Router } from 'express';
import { listClients } from '../db.js';
import { getAdapter } from '../adapters/registry.js';
import { mapWithConcurrency } from '../concurrency.js';
import type { BatchTrackerRequest, TrackerAggregate, BatchResult } from '@shared/types';
import { logger } from '../logger.js';

const router = Router();
const TRACKER_CONCURRENCY = 8;

// 聚合结果缓存：避免每次请求都遍历 31000+ 个种子做 tracker 聚合
// TTL 30s：前端轮询 30s，缓存 >= 轮询间隔确保命中率
const AGGREGATE_CACHE_TTL_MS = 30000;
let aggregateCache: { data: TrackerAggregate[]; expireAt: number } | null = null;

// 跨客户端 Tracker 聚合统计
router.get('/', async (_req, res) => {
  // 命中缓存直接返回
  if (aggregateCache && aggregateCache.expireAt > Date.now()) {
    return res.json({ success: true, data: aggregateCache.data });
  }

  const clients = listClients().filter((c) => c.status !== 'offline');
  const aggregate = new Map<string, TrackerAggregate>();

  const results = await mapWithConcurrency(clients, async (c) => {
    const adapter = getAdapter(c.id);
    if (!adapter) return;
    const torrents = await adapter.getTorrents();
    for (const t of torrents) {
      for (const url of t.trackers) {
        if (!aggregate.has(url)) {
          aggregate.set(url, { url, torrentCount: 0, totalSeeders: 0, totalLeechers: 0, clients: [] });
        }
        const agg = aggregate.get(url)!;
        agg.torrentCount++;
        if (!agg.clients.includes(c.name)) agg.clients.push(c.name);
      }
    }
  }, TRACKER_CONCURRENCY);

  results.forEach((r, i) => {
    if (r.status === 'rejected') logger.warn({ clientId: clients[i]?.id }, 'Tracker 聚合失败');
  });

  const list = Array.from(aggregate.values()).sort((a, b) => b.torrentCount - a.torrentCount);
  aggregateCache = { data: list, expireAt: Date.now() + AGGREGATE_CACHE_TTL_MS };
  res.json({ success: true, data: list });
});

// 批量 Tracker 操作（增/改/删，支持正则替换）
router.post('/batch', async (req, res) => {
  const body = req.body as BatchTrackerRequest;
  if (!body?.torrentKeys?.length || !body.operation) {
    return res.status(400).json({ success: false, error: '缺少参数' });
  }

  const { torrentKeys, operation, urls, replace } = body;

  // 预览模式
  if (body.previewOnly) {
    const preview = torrentKeys.map((k) => ({
      clientId: k.clientId,
      hash: k.hash,
      willAffect: true,
      operation,
    }));
    return res.json({ success: true, data: { preview, affected: preview.length } });
  }

  const results: BatchResult[] = [];
  for (const key of torrentKeys) {
    const adapter = getAdapter(key.clientId);
    if (!adapter) {
      results.push({ success: false, clientId: key.clientId, hash: key.hash, error: '客户端不存在' });
      continue;
    }
    try {
      if (operation === 'add' && urls) {
        await adapter.addTracker(key.hash, urls);
      } else if (operation === 'remove' && urls) {
        await adapter.removeTracker(key.hash, urls);
      } else if (operation === 'replace' && replace) {
        // 支持正则替换：先获取该种子所有 tracker，匹配 from 的逐个替换
        const details = await adapter.getTorrentDetails(key.hash);
        const matched = details.trackers.filter((t) => {
          try {
            return new RegExp(replace.from).test(t.url);
          } catch {
            return t.url === replace.from;
          }
        });
        for (const t of matched) {
          const newUrl = replace.to.includes('$1') ? t.url.replace(new RegExp(replace.from), replace.to) : replace.to;
          await adapter.replaceTracker(key.hash, t.url, newUrl);
        }
      }
      results.push({ success: true, clientId: key.clientId, hash: key.hash });
    } catch (e) {
      results.push({ success: false, clientId: key.clientId, hash: key.hash, error: (e as Error).message });
    }
  }

  res.json({ success: results.every((r) => r.success), data: results });
  // 批量操作后清除聚合缓存，下次请求重新聚合
  aggregateCache = null;
});

export default router;
