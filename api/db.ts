// JSON 文件存储层 - 替代 SQLite，避免原生编译依赖
// 数据量小（本地工具），JSON 文件足够，且零原生依赖
import fs from 'fs';
import { config, ensureDataDir } from './config.js';
import type {
  ClientInstance,
  ClientType,
  Alert,
  AlertLevel,
  MonitorRule,
  ActivityEvent,
} from '@shared/types';

interface Store {
  clients: ClientRecord[];
  alerts: AlertRecord[];
  activities: ActivityRecord[];
  rules: RuleRecord[];
  settings: Record<string, string>;
}

interface ClientRecord {
  id: string;
  name: string;
  type: ClientType;
  url: string;
  username: string;
  password_enc: string;
  status: ClientInstance['status'];
  version?: string;
  created_at: number;
  last_seen?: number;
}
interface AlertRecord {
  id: string;
  client_id: string;
  level: AlertLevel;
  event: string;
  detail: string;
  status: 'open' | 'acknowledged' | 'resolved';
  created_at: number;
  resolved_at?: number;
}
interface ActivityRecord {
  id: string;
  client_id: string;
  event_type: string;
  payload: string;
  created_at: number;
}
interface RuleRecord {
  id: string;
  name: string;
  rule_type: string;
  config: string;
  enabled: boolean;
}

let store: Store;
let saveTimer: NodeJS.Timeout | null = null;

export function initDb(): Store {
  ensureDataDir();
  store = load();
  seedDefaults();
  scheduleSave();
  return store;
}

function load(): Store {
  try {
    if (fs.existsSync(config.dbPath)) {
      const raw = fs.readFileSync(config.dbPath, 'utf8');
      return JSON.parse(raw) as Store;
    }
  } catch (e) {
    console.error('加载存储失败，使用空存储:', (e as Error).message);
  }
  return { clients: [], alerts: [], activities: [], rules: [], settings: {} };
}

function persist(): void {
  ensureDataDir();
  fs.writeFileSync(config.dbPath, JSON.stringify(store, null, 2));
}

// 防抖保存，避免高频写入
function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persist();
  }, 200);
}

function seedDefaults(): void {
  const defaultRules: RuleRecord[] = [
    { id: 'dead-seed', name: '死种检测', rule_type: 'dead_seed', config: '{"noPeerHours":24,"noProgressHours":12}', enabled: true },
    { id: 'tracker-dead', name: 'Tracker 失效', rule_type: 'tracker_dead', config: '{"failThreshold":3,"intervalMin":15}', enabled: true },
    { id: 'disk-water', name: '磁盘水位', rule_type: 'disk_water', config: '{"warnPercent":85,"criticalPercent":95}', enabled: true },
    { id: 'client-reconnect', name: '客户端断连重试', rule_type: 'client_reconnect', config: '{"maxRetry":5,"backoffBaseSec":2}', enabled: true },
  ];
  for (const r of defaultRules) {
    if (!store.rules.find((x) => x.id === r.id)) store.rules.push(r);
  }

  const defaults: Record<string, string> = {
    port: String(config.defaultPort),
    host: config.defaultHost,
    authEnabled: 'false',
    authToken: '',
    theme: 'dark',
    openBrowserOnStart: 'true',
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (store.settings[k] === undefined) store.settings[k] = v;
  }
  scheduleSave();
}

export function getDb(): Store {
  if (!store) initDb();
  return store;
}

// ===== 密码编码 =====
export function encodePassword(plain: string): string {
  try { return Buffer.from(plain).toString('base64'); } catch { return plain; }
}
export function decodePassword(enc: string): string {
  try { return Buffer.from(enc, 'base64').toString('utf8'); } catch { return ''; }
}

function recordToClient(r: ClientRecord): ClientInstance {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    url: r.url,
    username: r.username,
    password: decodePassword(r.password_enc),
    status: r.status,
    version: r.version,
    createdAt: r.created_at,
    lastSeen: r.last_seen,
  };
}

// ===== 客户端 CRUD =====
export function listClients(): ClientInstance[] {
  return getDb().clients.map(recordToClient);
}

export function getClient(id: string): ClientInstance | undefined {
  const r = getDb().clients.find((c) => c.id === id);
  return r ? recordToClient(r) : undefined;
}

export function createClient(data: Omit<ClientInstance, 'status' | 'createdAt' | 'lastSeen' | 'id'> & { id?: string }): ClientInstance {
  const id = data.id || generateId();
  const now = Date.now();
  const rec: ClientRecord = {
    id, name: data.name, type: data.type, url: data.url,
    username: data.username, password_enc: encodePassword(data.password),
    status: 'offline', created_at: now,
  };
  getDb().clients.push(rec);
  scheduleSave();
  return recordToClient(rec);
}

export function updateClient(id: string, data: Partial<ClientInstance>): ClientInstance | undefined {
  const rec = getDb().clients.find((c) => c.id === id);
  if (!rec) return undefined;
  if (data.name !== undefined) rec.name = data.name;
  if (data.type !== undefined) rec.type = data.type;
  if (data.url !== undefined) rec.url = data.url;
  if (data.username !== undefined) rec.username = data.username;
  if (data.password !== undefined) rec.password_enc = encodePassword(data.password);
  if (data.status !== undefined) rec.status = data.status;
  if (data.version !== undefined) rec.version = data.version;
  if (data.lastSeen !== undefined) rec.last_seen = data.lastSeen;
  scheduleSave();
  return recordToClient(rec);
}

export function deleteClient(id: string): void {
  const db = getDb();
  db.clients = db.clients.filter((c) => c.id !== id);
  db.alerts = db.alerts.filter((a) => a.client_id !== id);
  db.activities = db.activities.filter((a) => a.client_id !== id);
  scheduleSave();
}

// ===== 告警 CRUD =====
export function listAlerts(limit = 100): Alert[] {
  return getDb().alerts
    .slice()
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit)
    .map((r) => {
      const client = getClient(r.client_id);
      return {
        id: r.id, clientId: r.client_id, clientName: client?.name,
        level: r.level, event: r.event, detail: r.detail,
        status: r.status, createdAt: r.created_at, resolvedAt: r.resolved_at,
      };
    });
}

export function createAlert(data: Omit<Alert, 'id' | 'createdAt' | 'status'>): Alert {
  const id = generateId();
  const now = Date.now();
  const rec: AlertRecord = {
    id, client_id: data.clientId, level: data.level, event: data.event,
    detail: data.detail, status: 'open', created_at: now,
  };
  getDb().alerts.push(rec);
  scheduleSave();
  const client = getClient(data.clientId);
  return { ...data, id, status: 'open', createdAt: now, clientName: client?.name };
}

export function updateAlert(id: string, status: Alert['status']): void {
  const rec = getDb().alerts.find((a) => a.id === id);
  if (!rec) return;
  rec.status = status;
  if (status === 'resolved') rec.resolved_at = Date.now();
  scheduleSave();
}

// ===== 活动流 CRUD =====
export function listActivities(limit = 50): ActivityEvent[] {
  return getDb().activities
    .slice()
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit)
    .map((r) => {
      const client = getClient(r.client_id);
      return {
        id: r.id, clientId: r.client_id, clientName: client?.name,
        eventType: r.event_type, payload: r.payload ? JSON.parse(r.payload) : {},
        createdAt: r.created_at,
      };
    });
}

export function createActivity(clientId: string, eventType: string, payload: Record<string, unknown>): ActivityEvent {
  const id = generateId();
  const now = Date.now();
  const rec: ActivityRecord = { id, client_id: clientId, event_type: eventType, payload: JSON.stringify(payload), created_at: now };
  const db = getDb();
  db.activities.push(rec);
  // 保留最近 N 条
  if (db.activities.length > config.activityRetention) {
    db.activities = db.activities.slice(-config.activityRetention);
  }
  scheduleSave();
  const client = getClient(clientId);
  return { id, clientId, clientName: client?.name, eventType, payload, createdAt: now };
}

// ===== 监测规则 =====
export function listRules(): MonitorRule[] {
  return getDb().rules.map((r) => ({
    id: r.id, name: r.name, ruleType: r.rule_type,
    config: JSON.parse(r.config), enabled: r.enabled,
  }));
}

export function updateRule(id: string, data: Partial<MonitorRule>): void {
  const rec = getDb().rules.find((r) => r.id === id);
  if (!rec) return;
  if (data.name !== undefined) rec.name = data.name;
  if (data.config !== undefined) rec.config = JSON.stringify(data.config);
  if (data.enabled !== undefined) rec.enabled = data.enabled;
  scheduleSave();
}

// ===== 设置 =====
export function getSettings(): Record<string, string> {
  return { ...getDb().settings };
}

export function setSetting(key: string, value: string): void {
  getDb().settings[key] = value;
  scheduleSave();
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 进程退出时同步落盘
process.on('exit', () => { if (store) persist(); });
process.on('SIGINT', () => { if (store) persist(); process.exit(0); });
process.on('SIGTERM', () => { if (store) persist(); process.exit(0); });
