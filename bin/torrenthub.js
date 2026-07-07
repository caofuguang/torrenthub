#!/usr/bin/env node
// TorrentHub CLI 入口 - 生产运行编译后的 JS,开发用 tsx
import { startServer } from '../api/server.js';
import open from 'open';

const args = parseArgs(process.argv.slice(2));

const port = args.port ? Number(args.port) : undefined;
const host = args.host;
const openBrowser = args.browser !== false;

startServer({ port, host, openBrowser })
  .then(({ port: actualPort, host: actualHost }) => {
    const url = `http://${actualHost === '0.0.0.0' ? '127.0.0.1' : actualHost}:${actualPort}`;
    console.log(`\n  TorrentHub 已启动: ${url}\n`);
    if (openBrowser) {
      open(url).catch(() => {
        console.log(`  请在浏览器打开: ${url}`);
      });
    }
  })
  .catch((err) => {
    console.error('启动失败:', err.message);
    process.exit(1);
  });

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' || a === '-p') { out.port = argv[++i]; continue; }
    if (a === '--host' || a === '-H') { out.host = argv[++i]; continue; }
    if (a === '--no-browser' || a === '--no-open') { out.browser = false; continue; }
    if (a === '--help' || a === '-h') {
      console.log(`TorrentHub - 多客户端种子统一管理平台

用法:
  torrenthub                  默认启动 (127.0.0.1:7878)
  torrenthub --port 9000      指定端口
  torrenthub --host 0.0.0.0   监听所有地址
  torrenthub --no-browser     不自动打开浏览器

选项:
  -p, --port <port>     服务端口 (默认 7878)
  -H, --host <host>     监听地址 (默认 127.0.0.1)
      --no-browser      不自动打开浏览器
  -h, --help            显示帮助`);
      process.exit(0);
    }
  }
  return out;
}