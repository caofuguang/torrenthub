// 本地服务入口 - 初始化数据库、WebSocket、监测调度器
import http from 'http';
import { pathToFileURL } from 'url';
import { createApp } from './app.js';
import { initDb } from './db.js';
import { initWebSocket } from './ws.js';
import { startMonitor } from './monitor.js';
import { connectAll } from './adapters/registry.js';
import { logger } from './logger.js';

export interface StartOptions {
  port?: number;
  host?: string;
  openBrowser?: boolean;
}

export async function startServer(opts: StartOptions = {}): Promise<{ port: number; host: string }> {
  const port = opts.port || Number(process.env.PORT) || 7878;
  const host = opts.host || process.env.HOST || '127.0.0.1';

  // 初始化数据库
  initDb();
  logger.info('数据库已初始化');

  const app = createApp();
  const server = http.createServer(app);

  // WebSocket
  initWebSocket(server);
  logger.info('WebSocket 已就绪 (/ws)');

  // 监测调度器
  startMonitor();

  // 启动 HTTP 服务
  await new Promise<void>((resolve) => {
    server.listen(port, host, () => resolve());
  });

  logger.info(`TorrentHub 服务已启动: http://${host}:${port}`);

  // 并发连接所有客户端
  connectAll().catch((e) => logger.warn({ err: e.message }, '初始连接客户端失败'));

  return { port, host };
}

// 直接运行（开发模式 / nodemon）
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startServer().catch((e) => {
    logger.error({ err: e.message }, '启动失败');
    process.exit(1);
  });
}

export default startServer;
