// 种子管理路由（跨客户端聚合）
import { Router } from 'express';
import { listClients } from '../db.js';
import { getAdapter, invalidateTorrentCache } from '../adapters/registry.js';
import { mapWithConcurrency } from '../concurrency.js';
import type { UnifiedTorrent, AddTorrentRequest, BatchResult } from '@shared/types';
import { logger } from '../logger.js';

const router = Router();
const TORRENTS_CONCURRENCY = 8;

// 跨客户端聚合种子列表
router.get('/', async (req, res) => {
  const { clientId, status, search } = req.query as Record<string, string>;
  const clients = listClients().filter((c) => c.status !== 'offline');
  const targetClients = clientId ? [clientId] : clients.map((c) => c.id);

  const results = await mapWithConcurrency(
    targetClients,
    async (cid) => {
      const adapter = getAdapter(cid);
      if (!adapter) return [] as UnifiedTorrent[];
      return adapter.getTorrents();
    },
    TORRENTS_CONCURRENCY,
  );

  let torrents: UnifiedTorrent[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') torrents = torrents.concat(r.value);
    else logger.warn({ clientId: targetClients[i], err: r.reason?.message }, '拉取种子失败');
  });

  if (status) torrents = torrents.filter((t) => t.status === status);
  if (search) {
    const q = search.toLowerCase();
    torrents = torrents.filter((t) => t.name.toLowerCase().includes(q));
  }

  // 排序：默认按添加时间倒序
  torrents.sort((a, b) => b.addedOn - a.addedOn);

  res.json({
    success: true,
    data: torrents,
    total: torrents.length,
  });
});

// 单个种子详情
router.get('/:clientId/:hash', async (req, res) => {
  const adapter = getAdapter(req.params.clientId);
  if (!adapter) return res.status(404).json({ success: false, error: '客户端不存在' });
  try {
    const details = await adapter.getTorrentDetails(req.params.hash);
    res.json({ success: true, data: details });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// 添加种子（多客户端分发）
router.post('/', async (req, res) => {
  const body = req.body as AddTorrentRequest;
  if (!body?.source || !body?.clientIds?.length) {
    return res.status(400).json({ success: false, error: '缺少 source 或 clientIds' });
  }

  const opts = {
    savePath: body.savePath,
    paused: body.paused,
    limit: body.limit,
    category: body.category,
    tags: body.tags,
  };

  const results = await Promise.all(
    body.clientIds.map(async (cid): Promise<BatchResult> => {
      const adapter = getAdapter(cid);
      if (!adapter) return { success: false, clientId: cid, hash: '', error: '客户端不存在' };
      try {
        await adapter.addTorrent(body.source, opts);
        return { success: true, clientId: cid, hash: '' };
      } catch (e) {
        return { success: false, clientId: cid, hash: '', error: (e as Error).message };
      }
    }),
  );

  const allOk = results.every((r) => r.success);
  body.clientIds.forEach((cid) => invalidateTorrentCache(cid));
  res.status(allOk ? 200 : 207).json({ success: allOk, data: results });
});

// 批量删除
router.delete('/', async (req, res) => {
  const { keys, deleteFiles } = (req.body || {}) as { keys: { clientId: string; hash: string }[]; deleteFiles?: boolean };
  if (!keys?.length) return res.status(400).json({ success: false, error: '缺少 keys' });

  // 按客户端分组
  const grouped = new Map<string, string[]>();
  for (const k of keys) {
    if (!grouped.has(k.clientId)) grouped.set(k.clientId, []);
    grouped.get(k.clientId)!.push(k.hash);
  }

  const results: BatchResult[] = [];
  for (const [cid, hashes] of grouped) {
    const adapter = getAdapter(cid);
    if (!adapter) {
      hashes.forEach((h) => results.push({ success: false, clientId: cid, hash: h, error: '客户端不存在' }));
      continue;
    }
    try {
      await adapter.deleteTorrents(hashes, !!deleteFiles);
      hashes.forEach((h) => results.push({ success: true, clientId: cid, hash: h }));
    } catch (e) {
      hashes.forEach((h) => results.push({ success: false, clientId: cid, hash: h, error: (e as Error).message }));
    }
  }

  res.json({ success: results.every((r) => r.success), data: results });
  for (const cid of grouped.keys()) invalidateTorrentCache(cid);
});

// 批量暂停/恢复
router.patch('/state', async (req, res) => {
  const { keys, action } = (req.body || {}) as {
    keys: { clientId: string; hash: string }[];
    action: 'pause' | 'resume';
  };
  if (!keys?.length || !action) return res.status(400).json({ success: false, error: '缺少参数' });

  const grouped = new Map<string, string[]>();
  for (const k of keys) {
    if (!grouped.has(k.clientId)) grouped.set(k.clientId, []);
    grouped.get(k.clientId)!.push(k.hash);
  }

  const results: BatchResult[] = [];
  for (const [cid, hashes] of grouped) {
    const adapter = getAdapter(cid);
    if (!adapter) {
      hashes.forEach((h) => results.push({ success: false, clientId: cid, hash: h, error: '客户端不存在' }));
      continue;
    }
    try {
      if (action === 'pause') await adapter.pauseTorrents(hashes);
      else await adapter.resumeTorrents(hashes);
      hashes.forEach((h) => results.push({ success: true, clientId: cid, hash: h }));
    } catch (e) {
      hashes.forEach((h) => results.push({ success: false, clientId: cid, hash: h, error: (e as Error).message }));
    }
  }

  res.json({ success: results.every((r) => r.success), data: results });
  for (const cid of grouped.keys()) invalidateTorrentCache(cid);
});

// 设置文件优先级
router.post('/:clientId/:hash/files/priority', async (req, res) => {
  const adapter = getAdapter(req.params.clientId);
  if (!adapter) return res.status(404).json({ success: false, error: '客户端不存在' });
  const { fileIndices, priority } = req.body || {};
  try {
    await adapter.setFilePriority(req.params.hash, fileIndices, priority);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// 单种子 Tracker 操作
router.post('/:clientId/:hash/trackers', async (req, res) => {
  const adapter = getAdapter(req.params.clientId);
  if (!adapter) return res.status(404).json({ success: false, error: '客户端不存在' });
  const { urls } = req.body || {};
  try {
    await adapter.addTracker(req.params.hash, urls);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

router.put('/:clientId/:hash/trackers', async (req, res) => {
  const adapter = getAdapter(req.params.clientId);
  if (!adapter) return res.status(404).json({ success: false, error: '客户端不存在' });
  const { from, to } = req.body || {};
  try {
    await adapter.replaceTracker(req.params.hash, from, to);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

router.delete('/:clientId/:hash/trackers', async (req, res) => {
  const adapter = getAdapter(req.params.clientId);
  if (!adapter) return res.status(404).json({ success: false, error: '客户端不存在' });
  const { urls } = req.body || {};
  try {
    await adapter.removeTracker(req.params.hash, urls);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

export default router;
