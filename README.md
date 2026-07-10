# TorrentHub

> 多客户端种子统一管理平台 —— 一个面板同时管理 qBittorrent 与 Transmission，覆盖添加/删除种子、Tracker 批量编辑、故障监测、原 API 透传等全部能力。

## 功能概览

- **多客户端统一管理**：同时接入多个 qBittorrent / Transmission 实例，跨客户端聚合查看种子
- **种子全生命周期**：磁链 / URL / 文件添加，多客户端分发，批量暂停/恢复/删除，文件优先级调整
- **Tracker 批量工作台**：跨客户端 Tracker 聚合，正则替换（支持 `$1` 反向引用），预览模式
- **故障监测**：健康轮询 + 指数退避重连，死种检测，磁盘水位告警，告警状态流转
- **全 API 透传**：qBittorrent Web API v2 / Transmission RPC 任意端点直通，内置在线 API 测试工作台
- **实时推送**：WebSocket 业务事件 + SSE 日志流，30s 心跳保活
- **资源优化**：TTL 双缓存（getTorrents + getFreeSpace）、并发限制、fetch 超时、alerts 自动清理，支撑 20+ 客户端规模
- **跨平台**：macOS / Windows / Linux，Windows 自包含分发包内置 Node.js 运行时

## 快速开始

### 环境要求

| 项 | 要求 |
|---|---|
| Node.js | 18+（推荐 20 LTS） |
| npm | 9+ |
| 网络 | 能访问 qBittorrent / Transmission 的 Web 端口 |

### macOS / Linux

```bash
# 安装依赖
npm install

# 生产构建（前端 + 后端）
npm run build && npm run build:server

# 启动（默认 http://127.0.0.1:7878，自动打开浏览器）
npm start
```

### 开发模式（热重载）

```bash
# 前端 :5173 + 后端 :3001 同时热重载
npm run dev
```

### Windows 分发包打包

```bash
# 生成自包含 ZIP（内置 Node.js 运行时，解压即用）
npm run package:windows
# 输出: dist/TorrentHub-win-x64.zip
```

Windows 用户解压后双击 `torrenthub.cmd` 即可运行，无需安装 Node.js。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 6 + TailwindCSS 3 + @tanstack/react-query v5 + lucide-react |
| 路由 | react-router-dom v7 |
| 后端 | Express 4 + TypeScript（ESM） |
| 实时 | ws（WebSocket）+ SSE（日志流） |
| 日志 | pino + pino-pretty |
| 存储 | JSON 文件（零原生依赖） |
| 进程 | Node 18+ 原生 fetch |

## 架构概览

```
浏览器 (React SPA)
  │  REST /api/*  +  WebSocket /ws  +  SSE /api/logs
  ▼
Express App
  ├── routes/        clients / torrents / trackers / monitor / dashboard / proxy / settings
  ├── adapters/      ClientAdapter 接口
  │     ├── qbittorrent.ts    Web API v2（含 5.2+ 兼容）
  │     ├── transmission.ts   RPC（409 重试）
  │     └── registry.ts       注册中心 + TTL 缓存 + 连接管理
  ├── monitor.ts     健康检查 + 死种检测 + alerts 清理
  ├── db.ts          JSON 存储（防抖落盘 + 退出兜底）
  └── ws.ts          WebSocket 广播中心
```

**核心设计**：适配器模式屏蔽客户端差异，上层路由只调统一接口；`/api/proxy` 透传兜底覆盖适配器未封装的全部 API。

详细架构说明请参阅 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 目录结构

```
torrenthub/
├── bin/torrenthub.js          # CLI 入口
├── api/                       # 后端
│   ├── app.ts                 # Express 装配
│   ├── server.ts              # HTTP + WS + 监测调度启动
│   ├── config.ts              # 配置（端口/间隔/数据目录）
│   ├── db.ts                  # JSON 存储层
│   ├── monitor.ts             # 故障监测调度器
│   ├── ws.ts                  # WebSocket 广播
│   ├── logger.ts              # pino 日志 + SSE 订阅
│   ├── concurrency.ts         # 并发控制工具
│   ├── adapters/              # 客户端适配器
│   └── routes/                # REST 路由
├── shared/types.ts            # 前后端共享类型
├── src/                       # 前端
│   ├── App.tsx                # 路由表
│   ├── components/            # 布局 + UI 组件
│   ├── lib/                   # API 封装 + 格式化工具
│   └── pages/                 # 7 大业务页面
├── scripts/build-windows.js   # Windows 打包脚本
└── dist/                      # 构建产物
```

## API 速查

| 资源 | 方法 | 路径 |
|---|---|---|
| 仪表盘 | GET | `/api/dashboard` |
| 客户端 | GET/POST | `/api/clients` |
| 测试连接 | POST | `/api/clients/test` |
| 重连 | POST | `/api/clients/:id/reconnect` |
| 种子列表 | GET | `/api/torrents` |
| 添加种子 | POST | `/api/torrents` |
| 批量删除 | DELETE | `/api/torrents` |
| 暂停/恢复 | PATCH | `/api/torrents/state` |
| Tracker 聚合 | GET | `/api/trackers` |
| Tracker 批量 | POST | `/api/trackers/batch` |
| 告警 | GET | `/api/monitor/alerts` |
| 规则 | GET/PUT | `/api/monitor/rules` |
| 设置 | GET/PUT | `/api/settings` |
| 日志流 | SSE | `/api/logs` |
| WebSocket | WS | `/ws` |
| qB 透传 | ALL | `/api/proxy/:id/qbittorrent/*` |
| Tr 透传 | POST | `/api/proxy/:id/transmission` |

## CLI 参数

```bash
torrenthub                  # 默认 127.0.0.1:7878
torrenthub --port 9000      # 指定端口
torrenthub --host 0.0.0.0   # 监听所有地址
torrenthub --no-browser     # 不自动开浏览器
```

环境变量：`TORRENTHUB_DATA_DIR`（数据目录，默认 `~/.torrenthub`）

## 开发

```bash
npm run dev          # 前后端热重载
npm run check        # TypeScript 类型检查
npm run lint         # ESLint
npm run build        # 构建前端
npm run build:server # 编译后端 TS → JS
```

## 资源优化

针对 20+ 客户端规模做了以下优化：

| 优化点 | 说明 |
|---|---|
| TTL 双缓存 | getTorrents（4s）+ getFreeSpace（30s）缓存，跨路由共享，热路径 38 倍提速 |
| 并发限制 | dashboard/torrents/trackers 路由并发 8，监测任务并发 5 |
| fetch 超时 | 下游客户端请求 15s AbortController 超时，避免无限挂起 |
| alerts 清理 | 每日定时清理 30 天前告警，open 告警上限 500 条 |
| SSE 心跳 | 30s 心跳 + 10 连接上限，防止僵死连接 |
| 缓存防雪崩 | TTL ±1s 随机抖动，避免 20 客户端同时过期 |
| 异步落盘 | JSON 持久化改 fs.writeFile 异步，退出时同步兜底 |

## 数据备份

前端"设置"页提供导入导出：

- **导出**：下载 `torrenthub-backup-YYYY-MM-DD.json`
- **导入**：支持合并 / 覆盖模式，导入前自动备份至 `config.json.bak`

数据文件位置：`~/.torrenthub/config.json`（可用 `TORRENTHUB_DATA_DIR` 覆盖）

## 开机自启

- **macOS**：launchd 守护进程，详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#07-开机自启launchd-守护进程)
- **Windows**：使用 [nssm](https://nssm.cc/) 注册为系统服务

## License

Private
