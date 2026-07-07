// 透传路由 - 直接映射到原客户端 API，支持全部能力
import { Router } from 'express';
import { getAdapter } from '../adapters/registry.js';
import { getClient } from '../db.js';

const router = Router();

// qBittorrent 透传：/api/proxy/:clientId/qbittorrent/*
router.all('/:clientId/qbittorrent/*', async (req, res) => {
  const adapter = getAdapter(req.params.clientId);
  if (!adapter) return res.status(404).json({ success: false, error: '客户端不存在' });
  if (adapter.type !== 'qbittorrent') return res.status(400).json({ success: false, error: '客户端类型不是 qBittorrent' });

  const path = '/' + req.params[0];
  const method = req.method;
  const isForm = req.headers['content-type']?.includes('application/x-www-form-urlencoded');
  try {
    const result = await adapter.raw(path, {
      method: method === 'GET' ? 'GET' : method,
      body: method !== 'GET' ? (isForm ? new URLSearchParams(req.body) : JSON.stringify(req.body)) : undefined,
      headers: isForm ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
      query: Object.keys(req.query).length ? (req.query as Record<string, string>) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// Transmission 透传：POST /api/proxy/:clientId/transmission
router.post('/:clientId/transmission', async (req, res) => {
  const adapter = getAdapter(req.params.clientId);
  if (!adapter) return res.status(404).json({ success: false, error: '客户端不存在' });
  if (adapter.type !== 'transmission') return res.status(400).json({ success: false, error: '客户端类型不是 Transmission' });

  const { method, arguments: args } = req.body || {};
  if (!method) return res.status(400).json({ success: false, error: '缺少 RPC method' });
  try {
    const result = await adapter.raw(method, { body: args || {} });
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// 透传时需要原 client 信息用于类型校验
void getClient;

export default router;
