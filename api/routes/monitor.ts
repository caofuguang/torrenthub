// 故障监测路由
import { Router } from 'express';
import { listAlerts, updateAlert, listRules, updateRule } from '../db.js';

const router = Router();

router.get('/alerts', (_req, res) => {
  res.json({ success: true, data: listAlerts() });
});

router.patch('/alerts/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['open', 'acknowledged', 'resolved'].includes(status)) {
    return res.status(400).json({ success: false, error: '无效状态' });
  }
  updateAlert(req.params.id, status);
  res.json({ success: true });
});

router.get('/rules', (_req, res) => {
  res.json({ success: true, data: listRules() });
});

router.put('/rules', (req, res) => {
  const rules = req.body as { id: string; name?: string; config?: Record<string, unknown>; enabled?: boolean }[];
  if (!Array.isArray(rules)) return res.status(400).json({ success: false, error: '需要数组' });
  for (const r of rules) updateRule(r.id, r);
  res.json({ success: true, data: listRules() });
});

export default router;
