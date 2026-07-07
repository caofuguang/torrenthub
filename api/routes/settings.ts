// 设置路由 + 数据导入导出
import fs from 'fs';
import { Router } from 'express';
import { getSettings, setSetting, getDb } from '../db.js';
import { config } from '../config.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ success: true, data: getSettings() });
});

router.put('/', (req, res) => {
  const settings = req.body || {};
  for (const [k, v] of Object.entries(settings)) {
    setSetting(k, String(v));
  }
  res.json({ success: true, data: getSettings() });
});

// ===== 数据导出 =====
router.get('/export', (_req, res) => {
  try {
    const store = getDb();
    const payload = {
      version: '1.0',
      exportedAt: Date.now(),
      data: {
        clients: store.clients,
        alerts: store.alerts,
        activities: store.activities,
        rules: store.rules,
        settings: store.settings,
      },
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="torrenthub-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.end(JSON.stringify(payload, null, 2));
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===== 数据导入 =====
router.post('/import', (req, res) => {
  try {
    const input = req.body;
    if (!input || !input.data) {
      return res.status(400).json({ success: false, error: 'Invalid import data' });
    }

    const { overwrite = false } = req.body;
    const importedData = input.data;
    const store = getDb();

    // 备份当前数据（写入同名.bak）
    const bakPath = config.dbPath + '.bak';
    fs.writeFileSync(bakPath, JSON.stringify(store, null, 2));

    // 合并或覆盖
    const mergeArrays = (target: unknown[], source: unknown[], keyField = 'id') => {
      const sourceMap = new Map();
      for (const item of source) {
        sourceMap.set((item as Record<string, unknown>)[keyField], item);
      }
      // 保留 target 中不在 source 中的项（当 overwrite=false）
      if (!overwrite) {
        const targetMap = new Map();
        for (const item of target) {
          targetMap.set((item as Record<string, unknown>)[keyField], item);
        }
        // 只保留 target 中没有的 source 项
        const merged = [...target];
        for (const [id, sourceItem] of sourceMap) {
          if (!targetMap.has(id)) {
            merged.push(sourceItem);
          }
        }
        return merged;
      }
      return source;
    };

    if (importedData.clients) {
      store.clients = overwrite ? importedData.clients : mergeArrays(store.clients, importedData.clients);
    }
    if (importedData.alerts) {
      store.alerts = overwrite ? importedData.alerts : mergeArrays(store.alerts, importedData.alerts, 'id');
    }
    if (importedData.activities) {
      store.activities = overwrite ? importedData.activities : mergeArrays(store.activities, importedData.activities, 'id');
    }
    if (importedData.rules) {
      store.rules = overwrite ? importedData.rules : mergeArrays(store.rules, importedData.rules, 'id');
    }
    if (importedData.settings) {
      if (overwrite) {
        store.settings = importedData.settings;
      } else {
        for (const [k, v] of Object.entries(importedData.settings)) {
          if (store.settings[k] === undefined) store.settings[k] = String(v);
        }
      }
    }

    // 立即持久化
    fs.writeFileSync(config.dbPath, JSON.stringify(store, null, 2));

    res.json({
      success: true,
      message: overwrite ? '数据已覆盖' : '数据已合并',
      backupPath: bakPath,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===== 查看当前数据目录路径（便于用户手动备份） =====
router.get('/data-path', (_req, res) => {
  res.json({
    success: true,
    dataDir: config.dataDir,
    dbPath: config.dbPath,
  });
});

export default router;
