// 故障监测调度器（setInterval 实现，支持任意可配置间隔）
import { listClients, updateClient, listRules, listAlerts, createAlert } from './db.js';
import { getAdapter, connectClient } from './adapters/registry.js';
import { broadcast } from './ws.js';
import { logger } from './logger.js';
import type { Alert, WSMessage } from '@shared/types';
import { config } from './config.js';

let healthTimer: NodeJS.Timeout | null = null;
let deadSeedTimer: NodeJS.Timeout | null = null;
const reconnectAttempts = new Map<string, number>();

export function startMonitor(): void {
  if (healthTimer) return;
  const healthMs = config.healthCheckIntervalSec * 1000;
  const deadSeedMs = config.deadSeedCheckIntervalSec * 1000;

  // 延迟启动：避免服务刚启动时瞬间产生大量 HTTP 请求
  setTimeout(async () => {
    await runHealthCheck();
  }, 3000);

  // 定时健康检查（每 10 分钟，仅 getVersion()，轻量）
  healthTimer = setInterval(async () => {
    await runHealthCheck();
  }, healthMs);

  // 死种检测（每小时，与 runHealthCheck 解耦）
  deadSeedTimer = setInterval(async () => {
    await checkDeadSeeds();
  }, deadSeedMs);

  logger.info(`故障监测调度器已启动 (健康=${healthMs}ms, 死种=${deadSeedMs}ms, 首次延迟 3s)`);
}

export function stopMonitor(): void {
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
  if (deadSeedTimer) { clearInterval(deadSeedTimer); deadSeedTimer = null; }
}

async function runHealthCheck(): Promise<void> {
  const clients = listClients();
  const rules = listRules();
  const reconnectRule = rules.find((r) => r.ruleType === 'client_reconnect');
  const maxRetry = (reconnectRule?.config as { maxRetry?: number })?.maxRetry || 5;
  const backoffBase = (reconnectRule?.config as { backoffBaseSec?: number })?.backoffBaseSec || 2;

  for (const c of clients) {
    try {
      const adapter = getAdapter(c.id);
      if (!adapter) continue;
      // 触发一次轻量请求
      await adapter.getVersion();
      if (c.status !== 'online') {
        updateClient(c.id, { status: 'online', lastSeen: Date.now() });
        broadcast({ type: 'client:status', payload: { clientId: c.id, status: 'online' } });
      }
      reconnectAttempts.set(c.id, 0);
    } catch (e) {
      // 连接失败，重试
      const attempts = (reconnectAttempts.get(c.id) || 0) + 1;
      reconnectAttempts.set(c.id, attempts);
      if (attempts <= maxRetry) {
        const delay = Math.pow(backoffBase, attempts) * 1000;
        logger.warn({ clientId: c.id, attempt: attempts, delayMs: delay }, '客户端连接失败，重试中');
        setTimeout(() => connectClient(c.id), delay);
      } else {
        // 超过重试上限，标记离线并告警
        updateClient(c.id, { status: 'offline' });
        broadcast({ type: 'client:status', payload: { clientId: c.id, status: 'offline' } });
        const existing = listAlerts().find((a) => a.clientId === c.id && a.event === '客户端离线' && a.status === 'open');
        if (!existing) {
          const alert = createAlert({
            clientId: c.id,
            level: 'critical',
            event: '客户端离线',
            detail: `客户端 ${c.name} (${c.url}) 已连续 ${maxRetry} 次连接失败: ${(e as Error).message}`,
          });
          broadcast({ type: 'alert:new', payload: alert as Alert });
        }
        reconnectAttempts.set(c.id, 0);
      }
    }
  }
}

async function checkDeadSeeds(): Promise<void> {
  const rules = listRules();
  const deadRule = rules.find((r) => r.ruleType === 'dead_seed' && r.enabled);
  if (!deadRule) return;
  const noPeerHours = (deadRule.config as { noPeerHours?: number })?.noPeerHours || 24;
  const now = Date.now();
  const onlineClients = listClients().filter((c) => c.status === 'online');
  for (const c of onlineClients) {
    try {
      const adapter = getAdapter(c.id);
      if (!adapter) continue;
      const torrents = await adapter.getTorrents();
      for (const t of torrents) {
        if (t.status === 'downloading' && t.downloadSpeed === 0 && t.uploadSpeed === 0) {
          const idleHours = (now - t.addedOn * 1000) / 3600000;
          if (idleHours > noPeerHours) {
            const exists = listAlerts().some(
              (a) => a.clientId === c.id && a.event === '死种检测' && a.detail.includes(t.hash) && a.status === 'open',
            );
            if (!exists) {
              const alert = createAlert({
                clientId: c.id,
                level: 'warning',
                event: '死种检测',
                detail: `种子 "${t.name}" (${t.hash.slice(0, 12)}) 已无速度超过 ${noPeerHours} 小时`,
              });
              broadcast({ type: 'alert:new', payload: alert as Alert } as WSMessage);
            }
          }
        }
      }
    } catch (e) {
      logger.debug({ clientId: c.id, err: (e as Error).message }, '死种检查失败');
    }
  }
}

export { runHealthCheck };
