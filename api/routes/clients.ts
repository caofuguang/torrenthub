// 客户端实例管理路由
import { Router } from 'express';
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
} from '../db.js';
import {
  getAdapter,
  refreshAdapter,
  removeAdapter,
  connectClient,
  testConnection,
  recordActivity,
} from '../adapters/registry.js';
import { logger } from '../logger.js';

const router = Router();

// 列出所有客户端
router.get('/', (_req, res) => {
  res.json({ success: true, data: listClients() });
});

// 获取单个
router.get('/:id', (req, res) => {
  const client = getClient(req.params.id);
  if (!client) return res.status(404).json({ success: false, error: '客户端不存在' });
  res.json({ success: true, data: client });
});

// 测试连接
router.post('/test', async (req, res) => {
  const { type, url, username, password } = req.body || {};
  if (!type || !url) return res.status(400).json({ success: false, error: '缺少参数' });
  const result = await testConnection({ type, url, username: username || '', password: password || '' });
  res.json({ success: result.ok, data: result });
});

// 添加
router.post('/', (req, res) => {
  const { name, type, url, username, password } = req.body || {};
  if (!name || !type || !url) return res.status(400).json({ success: false, error: '缺少参数' });
  const client = createClient({ name, type, url, username: username || '', password: password || '' });
  logger.info({ id: client.id, name }, '添加客户端');
  recordActivity(client.id, 'client_added', { name });
  // 异步连接
  connectClient(client.id).catch(() => {});
  res.json({ success: true, data: client });
});

// 更新
router.put('/:id', (req, res) => {
  const existing = getClient(req.params.id);
  if (!existing) return res.status(404).json({ success: false, error: '客户端不存在' });
  const updated = updateClient(req.params.id, req.body || {});
  refreshAdapter(req.params.id).catch(() => {});
  res.json({ success: true, data: updated });
});

// 删除
router.delete('/:id', (req, res) => {
  removeAdapter(req.params.id);
  deleteClient(req.params.id);
  res.json({ success: true });
});

// 版本信息
router.get('/:id/version', async (req, res) => {
  const adapter = getAdapter(req.params.id);
  if (!adapter) return res.status(404).json({ success: false, error: '客户端不存在' });
  try {
    const version = await adapter.getVersion();
    res.json({ success: true, data: { version } });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// 重新连接
router.post('/:id/reconnect', async (req, res) => {
  await refreshAdapter(req.params.id);
  const ok = await connectClient(req.params.id);
  res.json({ success: ok });
});

export default router;
