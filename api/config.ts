// 配置与路径管理
import os from 'os';
import path from 'path';
import fs from 'fs';

// 数据目录可通过环境变量覆盖（沙箱环境下使用项目内目录）
const TORRENTHUB_DIR = process.env.TORRENTHUB_DATA_DIR || path.join(os.homedir(), '.torrenthub');

export const config = {
  dataDir: TORRENTHUB_DIR,
  dbPath: path.join(TORRENTHUB_DIR, 'config.json'),
  defaultPort: 7878,
  defaultHost: '127.0.0.1',
  healthCheckIntervalSec: 600,
  deadSeedCheckIntervalSec: 3600,
  activityRetention: 200,
  alertRetentionDays: 30,
};

export function ensureDataDir(): void {
  if (!fs.existsSync(TORRENTHUB_DIR)) {
    fs.mkdirSync(TORRENTHUB_DIR, { recursive: true });
  }
}
