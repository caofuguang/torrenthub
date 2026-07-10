// Express 应用 - 装配所有路由与中间件
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { logger, subscribeLogs, logStream } from './logger.js';

import clientRoutes from './routes/clients.js';
import torrentRoutes from './routes/torrents.js';
import trackerRoutes from './routes/trackers.js';
import monitorRoutes from './routes/monitor.js';
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';
import proxyRoutes from './routes/proxy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): express.Application {
  const app: express.Application = express();

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // torrent 文件上传（torrent 文件通常 < 1MB，限制 10MB 防止内存滥用）
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });
  app.use('/api/torrents/upload', upload.single('torrent'));

  // API 路由
  app.use('/api/health', (_req, res) => res.json({ success: true, message: 'ok' }));
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/clients', clientRoutes);
  app.use('/api/torrents', torrentRoutes);
  app.use('/api/trackers', trackerRoutes);
  app.use('/api/monitor', monitorRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/proxy', proxyRoutes);

  // 日志 SSE（限制并发连接数 + 心跳保活）
  let sseConnectionCount = 0;
  const MAX_SSE_CONNECTIONS = 10;
  app.get('/api/logs', (req: Request, res: Response) => {
    if (sseConnectionCount >= MAX_SSE_CONNECTIONS) {
      return res.status(503).json({ success: false, error: '日志连接数已达上限' });
    }
    sseConnectionCount++;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify(logStream.list())}\n\n`);
    const unsub = subscribeLogs((entry) => {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    });
    // 心跳：每 30s 发送注释行，防止连接僵死
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);
    req.on('close', () => {
      unsub();
      clearInterval(heartbeat);
      sseConnectionCount--;
    });
  });

  // 静态前端（生产模式）
  // 编译后 __dirname = dist/server/api/，dist/ 在项目根目录（dist/server/ 的同级）
  const distPath = path.join(__dirname, '../..');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 错误处理
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err: error.message }, '未捕获错误');
    res.status(500).json({ success: false, error: error.message });
  });

  // 404
  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ success: false, error: 'API 不存在' });
    } else {
      res.status(404).json({ success: false, error: 'Not found' });
    }
  });

  return app;
}

export default createApp();
