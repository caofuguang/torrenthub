// 故障监测调度器（setInterval 实现，支持任意可配置间隔）
import { listClients, updateClient, listRules, listAlerts, createAlert, cleanupExpiredAlerts } from './db.js';
import { getAdapter, connectClient } from './adapters/registry.js';
import { broadcast } from './ws.js';
import { logger } from './logger.js';
import { mapWithConcurrency } from './concurrency.js';
import type { Alert, WSMessage } from '@shared/types';
import { config } from './config.js';

// 20 客户端规模下的并发上限，避免瞬时压垮下游
const MONITOR_CONCURRENCY = 5;

let healthTimer: NodeJS.Timeout | null = null;
let deadSeedTimer: NodeJS.Timeout | null = null;
let alertCleanupTimer: NodeJS.Timeout | null = null;
const reconnectAttempts = new Map<string, number>();
const reconnectTimers = new Set<NodeJS.Timeout>();

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

  // 告警清理（每天执行一次，删除超过保留期的已解决告警）
  alertCleanupTimer = setInterval(() => {
    const removed = cleanupExpiredAlerts(config.alertRetentionDays);
    if (removed > 0) logger.info({ removed }, '已清理过期告警');
  }, 24 * 3600 * 1000);

  logger.info(`故障监测调度器已启动 (健康=${healthMs}ms, 死种=${deadSeedMs}ms, 首次延迟 3s)`);
}

export function stopMonitor(): void {
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
  if (deadSeedTimer) { clearInterval(deadSeedTimer); deadSeedTimer = null; }
  if (alertCleanupTimer) { clearInterval(alertCleanupTimer); alertCleanupTimer = null; }
  // 清除所有待执行的重试定时器
  for (const t of reconnectTimers) clearTimeout(t);
  reconnectTimers.clear();
}

// 客户端删除时清理其监测状态
export function clearClientMonitorState(clientId: string): void {
  reconnectAttempts.delete(clientId);
}

async function runHealthCheck(): Promise<void> {
  const clients = listClients();
  const rules = listRules();
  const reconnectRule = rules.find((r) => r.ruleType === 'client_reconnect');
  const maxRetry = (reconnectRule?.config as { maxRetry?: number })?.maxRetry || 5;
  const backoffBase = (reconnectRule?.config as { backoffBaseSec?: number })?.backoffBaseSec || 2;

  // 预建已有"客户端离线"告警索引，避免每个客户端遍历全部 alerts
  const offlineAlertClients = new Set<string>();
  for (const a of listAlerts()) {
    if (a.event === '客户端离线' && a.status === 'open') offlineAlertClients.add(a.clientId);
  }

  // 并发检查（限制并发数），替代串行 for...of await
  await mapWithConcurrency(clients, async (c) => {
    try {
      const adapter = getAdapter(c.id);
      if (!adapter) return;
      await adapter.getVersion();
      if (c.status !== 'online') {
        updateClient(c.id, { status: 'online', lastSeen: Date.now() });
        broadcast({ type: 'client:status', payload: { clientId: c.id, status: 'online' } });
      }
      reconnectAttempts.set(c.id, 0);
    } catch (e) {
      const attempts = (reconnectAttempts.get(c.id) || 0) + 1;
      reconnectAttempts.set(c.id, attempts);
      if (attempts <= maxRetry) {
        const delay = Math.pow(backoffBase, attempts) * 1000;
        logger.warn({ clientId: c.id, attempt: attempts, delayMs: delay }, '客户端连接失败，重试中');
        const timer = setTimeout(() => {
          reconnectTimers.delete(timer);
          connectClient(c.id);
        }, delay);
        reconnectTimers.add(timer);
      } else {
        updateClient(c.id, { status: 'offline' });
        broadcast({ type: 'client:status', payload: { clientId: c.id, status: 'offline' } });
        if (!offlineAlertClients.has(c.id)) {
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
  }, MONITOR_CONCURRENCY);
}

async function checkDeadSeeds(): Promise<void> {
  const rules = listRules();
  const deadRule = rules.find((r) => r.ruleType === 'dead_seed' && r.enabled);
  if (!deadRule) return;
  const noPeerHours = (deadRule.config as { noPeerHours?: number })?.noPeerHours || 24;
  const now = Date.now();
  const onlineClients = listClients().filter((c) => c.status === 'online');

  // 预建已有死种告警索引：clientId -> Set<hash前缀>，避免每个种子遍历全部 alerts
  const openDeadSeedAlerts = new Map<string, Set<string>>();
  for (const a of listAlerts()) {
    if (a.event === '死种检测' && a.status === 'open') {
      const match = a.detail.match(/\(([a-f0-9]{8,12})\)/);
      if (match) {
        if (!openDeadSeedAlerts.has(a.clientId)) openDeadSeedAlerts.set(a.clientId, new Set());
        openDeadSeedAlerts.get(a.clientId)!.add(match[1]);
      }
    }
  }

  // 并发检查（限制并发数），替代串行 for...of await
  await mapWithConcurrency(onlineClients, async (c) => {
    try {
      const adapter = getAdapter(c.id);
      if (!adapter) return;
      const torrents = await adapter.getTorrents();
      const existingHashes = openDeadSeedAlerts.get(c.id) || new Set<string>();
      for (const t of torrents) {
        if (t.status === 'downloading' && t.downloadSpeed === 0 && t.uploadSpeed === 0) {
          const idleHours = (now - t.addedOn * 1000) / 3600000;
          if (idleHours > noPeerHours) {
            const hashPrefix = t.hash.slice(0, 12);
            if (existingHashes.has(hashPrefix)) continue;
            const alert = createAlert({
              clientId: c.id,
              level: 'warning',
              event: '死种检测',
              detail: `种子 "${t.name}" (${hashPrefix}) 已无速度超过 ${noPeerHours} 小时`,
            });
            broadcast({ type: 'alert:new', payload: alert as Alert } as WSMessage);
            existingHashes.add(hashPrefix);
          }
        }
      }
    } catch (e) {
      logger.debug({ clientId: c.id, err: (e as Error).message }, '死种检查失败');
    }
  }, MONITOR_CONCURRENCY);
}

export { runHealthCheck };
