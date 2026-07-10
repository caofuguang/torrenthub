# TorrentHub 项目架构与使用说明

> 多客户端种子统一管理平台：一个面板同时管理 qBittorrent 与 Transmission，覆盖添加/删除种子、Tracker 批量编辑、故障监测、原 API 透传等全部能力。

**运行环境**：macOS（Apple Silicon / Intel 均可），Node.js 18+（推荐 20 LTS 或更新）。

---

## 〇、macOS 快速开始

### 0.1 环境要求

| 项 | 要求 |
|---|---|
| 操作系统 | macOS 12 Monterey 及以上（Apple Silicon 与 Intel 均原生支持） |
| Node.js | 18+（项目使用原生 fetch、ESM、顶层 await，建议 20 LTS 或更新） |
| 包管理 | npm 9+（随 Node 附带） |
| 磁盘 | < 200 MB（含依赖） |
| 网络 | 能访问 qBittorrent / Transmission 的 Web 端口 |

检查环境：
```bash
node --version    # 应 ≥ v18
npm --version
uname -sm         # Darwin arm64 / Darwin x86_64
```

### 0.2 安装

```bash
# 进入项目目录
cd /path/to/torrenthub

# 安装依赖（纯 JS 依赖，无原生编译，Apple Silicon 无需 rosetta）
npm install
```

### 0.3 启动（terminal 命令拉起）

生产模式分两步：**先构建前端,再编译后端,最后启动编译产物**。

```bash
# 1. 构建前端静态文件（由 Express 托管）
npm run build

# 2. 编译后端 TS → JS（消除 tsx 实时转译开销,降低长期运行的 CPU 与内存占用）
npm run build:server

# 3. 启动（默认 127.0.0.1:7878，自动打开浏览器）
npm start
```

`npm start` 实际执行 `node dist/server/bin/torrenthub.js`（运行编译后的 JS，非 tsx 热加载）。

启动成功标志：
```
  TorrentHub 已启动: http://127.0.0.1:7878

[HH:MM:SS] INFO: 数据库已初始化
[HH:MM:SS] INFO: WebSocket 已就绪 (/ws)
[HH:MM:SS] INFO: 故障监测调度器已启动
[HH:MM:SS] INFO: TorrentHub 服务已启动: http://127.0.0.1:7878
```

浏览器会自动打开（依赖 `open` 包，macOS 调用系统 `open` 命令）。

> 修改后端代码后必须重新 `npm run build:server` 再 `npm start` 才能生效。若代码不变，直接 `npm start` 即可。

### 0.4 开发模式（热重载）

```bash
# 开发模式：前后端均热重载（前端 Vite :5173 / 后端 nodemon+tsx :3001）
npm run dev

# 仅开发后端（前端用已编译的 dist/，Express 托管 :7878）
npm run start:dev
# 或直接用 tsx 启动
tsx bin/torrenthub.js
```

> 开发模式使用 `tsx` 实时转译 TS 源码,有额外的 loader hook 开销,适合调试,不适合长期后台运行。

### 0.5 macOS 专属说明

| 项 | 说明 |
|---|---|
| 数据目录 | 默认 `~/.torrenthub/config.json`，可通过 `TORRENTHUB_DATA_DIR` 环境变量覆盖 |
| 浏览器拉起 | `open` 包在 macOS 调用系统 `open` 命令打开默认浏览器 |
| 进程信号 | 监听 `SIGINT`（Ctrl+C）/ `SIGTERM`，退出前同步落盘数据 |
| 端口占用 | 7878 被占用时用 `--port` 指定，或 `lsof -i :7878` 查占用 |
| 防火墙 | 首次启动 macOS 可能弹窗询问是否允许 node 接受网络连接，选"允许" |
| 全局命令 | `npm link` 后可直接 `torrenthub` 拉起（写入 `/usr/local/bin` 或 `~/.npm-global/bin`） |
| 后台运行 | 推荐 `launchd` 守护（详见 [0.7 节](#07-开机自启launchd-守护进程)）；临时后台可用 `nohup npm start -- --no-browser > /tmp/torrenthub.log 2>&1 &` |
| 开机自启 | 推荐 `launchd`，详见 [0.7 节](#07-开机自启launchd-守护进程) |

### 0.6 沙箱/受限环境说明

若运行在沙箱环境（如 Trae IDE 的 trae-sandbox），`~/.torrenthub` 可能因权限被拒（`EPERM: mkdir`）。此时用环境变量指向项目内或可写目录：

```bash
TORRENTHUB_DATA_DIR=.torrenthub-data npm start
# 或
TORRENTHUB_DATA_DIR=/tmp/torrenthub npm start
```

真实 macOS 环境无此限制。

### 0.7 开机自启（launchd 守护进程）

macOS 原生进程管理器 `launchd` 可实现**登录即启动、崩溃自动重启、统一日志**，比 `nohup` / `pm2` 更轻量、无第三方依赖。

> ⚠️ 生产模式下 plist 直接调用 `node dist/server/bin/torrenthub.js`（运行编译产物,无 tsx 实时转译开销），而非 `npm start`。这大幅降低了长期运行的 CPU 与内存占用。

#### 0.7.1 工作机制

- **运行身份**：用户级 LaunchAgent，文件置于 `~/Library/LaunchAgents/`，登录后由 `launchd` 自动加载
- **生命周期**：`RunAtLoad=true` 登录即拉起；`KeepAlive.SuccessfulExit=false` 进程异常退出（非 0 退出码）时按 `ThrottleInterval`（10s）退避重启
- **环境隔离**：launchd 默认不继承登录 shell 的 `PATH`，需在 plist 的 `EnvironmentVariables` 显式注入 `PATH`（含 Homebrew 的 `/opt/homebrew/bin` 或 `/usr/local/bin`）
- **日志重定向**：`StandardOutPath` / `StandardErrorPath` 接管进程标准输出与错误输出，无需 `nohup` 重定向

#### 0.7.2 Plist 文件

文件路径：`~/Library/LaunchAgents/com.torrenthub.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.torrenthub</string>

    <!-- 启动命令：直接 node 运行编译后的 JS（无 tsx,无 npm） -->
    <!-- --no-browser 避免每次重启时弹浏览器窗口 -->
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/node</string>
        <string>/Users/&lt;USER&gt;/TraeProject/torrenthub/dist/server/bin/torrenthub.js</string>
        <string>--no-browser</string>
    </array>

    <!-- 项目根目录（必须绝对路径，按实际位置修改） -->
    <key>WorkingDirectory</key>
    <string>/Users/&lt;USER&gt;/TraeProject/torrenthub</string>

    <!-- launchd 不继承登录 shell 的 PATH，需显式注入 -->
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>/Users/&lt;USER&gt;</string>
        <!-- 注释：此处不设置 NODE_ENV=production，pino 默认输出彩色 pretty 日志 -->
        <!-- 若需 JSON 结构化日志，可添加 <key>NODE_ENV</key><string>production</string> -->
    </dict>

    <!-- 登录后自动拉起 -->
    <key>RunAtLoad</key>
    <true/>

    <!-- 异常退出（非 0）才重启，主动 bootout 不会触发重启 -->
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <!-- 崩溃后退避 10s 再重启，避免高频占用 -->
    <key>ThrottleInterval</key>
    <integer>10</integer>

    <!-- 后台进程优先级，不影响前台应用性能 -->
    <key>ProcessType</key>
    <string>Background</string>

    <!-- 日志路径（绝对路径） -->
    <key>StandardOutPath</key>
    <string>/Users/&lt;USER&gt;/Library/Logs/torrenthub.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/&lt;USER&gt;/Library/Logs/torrenthub.err.log</string>
</dict>
</plist>
```

**路径替换说明**：

| 占位符 | 含义 | 示例 |
|---|---|---|
| `<USER>` | 当前登录用户名 | `caofuguang` |
| `/opt/homebrew/bin/node` | Apple Silicon Homebrew 路径；Intel Mac 改为 `/usr/local/bin/node` | — |
| `WorkingDirectory` 与 `ProgramArguments` 中的项目路径 | TorrentHub 项目根目录 | `/Users/caofuguang/TraeProject/torrenthub` |

可执行 `which node` 确认本机绝对路径。

**重要：在加载 plist 之前，必须先执行 `npm run build:server` 编译后端,确保 `dist/server/bin/torrenthub.js` 存在。**

#### 0.7.3 安装与管理

```bash
# 准备：确保日志目录与 LaunchAgents 目录存在
mkdir -p ~/Library/Logs ~/Library/LaunchAgents

# 先编译后端（必须，否则 dist/server/bin/torrenthub.js 不存在）
cd /path/to/torrenthub
npm run build:server

# 校验 plist 语法（必须返回 OK）
plutil -lint ~/Library/LaunchAgents/com.torrenthub.plist

# 加载并启用（登录用户域 gui/<uid>）
UID=$(id -u)
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.torrenthub.plist
launchctl enable gui/$UID/com.torrenthub

# 查看运行状态（state 应为 running）
launchctl print gui/$(id -u)/com.torrenthub | grep -E "state|pid|last exit"

# 查看进程
launchctl list | grep torrenthub

# 停止服务（直到下次登录或手动 bootstrap）
launchctl bootout gui/$(id -u)/ ~/Library/LaunchAgents/com.torrenthub.plist

# 修改后端代码后更新：先重新编译,再重载
cd /path/to/torrenthub && npm run build:server
launchctl bootout gui/$(id -u)/ ~/Library/LaunchAgents/com.torrenthub.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.torrenthub.plist
```

> ⚠️ `launchctl bootstrap` 在 `bootout` 后立即执行时偶发 `Input/output error`（macOS launchd 已知状态竞争）。若遇到此问题，可先 `xattr -c ~/Library/LaunchAgents/com.torrenthub.plist` 清理文件元数据，等待 3-5 秒后再 `bootstrap`。

#### 0.7.4 日志查看

```bash
# 实时跟踪 stdout（应用日志，默认彩色 pretty 格式）
tail -f ~/Library/Logs/torrenthub.log

# 实时跟踪 stderr（崩溃堆栈）
tail -f ~/Library/Logs/torrenthub.err.log

# 清空日志
: > ~/Library/Logs/torrenthub.log
: > ~/Library/Logs/torrenthub.err.log
```

#### 0.7.5 配置说明

| 配置项 | 取值 | 说明 |
|---|---|---|
| `ProgramArguments` | `node dist/server/bin/torrenthub.js --no-browser` | 直接运行编译后的 JS，`--no-browser` 避免崩溃重启时反复弹浏览器窗口，前端通过 `http://127.0.0.1:7878` 手动访问 |
| `NODE_ENV` | 未设置 | pino 默认输出彩色 pretty 日志；若需 JSON 结构化日志可添加 `NODE_ENV=production` |
| `KeepAlive.SuccessfulExit` | `false` | 仅在**异常退出**时重启；主动 `bootout` / `kill` 不触发重启 |
| `ThrottleInterval` | `10` | 崩溃后退避秒数，避免高频重启循环 |
| `ProcessType` | `Background` | 降低调度优先级，不抢占前台应用 |
| 端口冲突 | — | 若 7878 已被其他进程占用，launchd 会反复重启；用 `lsof -iTCP:7878 -sTCP:LISTEN` 查占用并 `kill` 后 launchd 自动接管 |

#### 0.7.6 切换运行行为

修改 plist 后必须 `bootout` + `bootstrap` 重新加载才能生效（launchd 不会自动重读已编辑的文件）：

```bash
UID=$(id -u)
launchctl bootout gui/$UID/ ~/Library/LaunchAgents/com.torrenthub.plist
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.torrenthub.plist
launchctl print gui/$UID/com.torrenthub | grep -E "state|pid"
```

**① 切换日志格式（NODE_ENV）**

默认**不设置** `NODE_ENV`，pino 输出彩色 pretty 日志（`[HH:MM:SS] INFO: 消息`）。

若需 JSON 行日志（每行一条 `{"level":30,...}`，适合长期运行与日志聚合），在 plist 的 `EnvironmentVariables` 中添加 `NODE_ENV` 键值对：

```xml
<key>EnvironmentVariables</key>
<dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>/Users/&lt;USER&gt;</string>
    <!-- 添加下面两行即切换为 JSON 结构化日志 -->
    <key>NODE_ENV</key>
    <string>production</string>
</dict>
```

验证：`tail -f ~/Library/Logs/torrenthub.log`，JSON 模式下每行可被 `jq` 解析。

**② 切换浏览器自动打开行为（--no-browser）**

默认传 `--no-browser`，避免 launchd 崩溃重启时反复弹浏览器窗口，前端通过 `http://127.0.0.1:7878/` 手动访问。

若希望 launchd 拉起时自动开浏览器，删除 plist 中 `ProgramArguments` 里的 `--no-browser` 行：

```xml
<key>ProgramArguments</key>
<array>
    <string>/opt/homebrew/bin/node</string>
    <string>/Users/&lt;USER&gt;/TraeProject/torrenthub/dist/server/bin/torrenthub.js</string>
    <!-- 删除下面这行即恢复自动开浏览器 -->
    <string>--no-browser</string>
</array>
```

> 注意：开启自动开浏览器后，每次 launchd 崩溃重启都会弹出新窗口，频繁崩溃时体验较差。后台守护场景建议保留 `--no-browser`。

修改任一项后，执行本节开头的通用重载流程使配置生效。

#### 0.7.7 与其他守护方式对比

| 方式 | 优点 | 缺点 |
|---|---|---|
| **launchd**（推荐） | macOS 原生、零依赖、登录即启、崩溃重启、统一日志 | 仅 macOS；plist 语法较繁 |
| `nohup ... &` | 简单一行命令 | 关终端即失效、不重启、需手动管理日志 |
| `pm2` | 跨平台、功能丰富（日志切割、监控面板） | 需全局安装 Node 包、占用额外进程 |
| `screen` / `tmux` | 可交互会话 | 退出后进程仍在但无自动重启 |

#### 0.7.8 卸载

```bash
# 1. 停止并卸载服务
launchctl bootout gui/$(id -u)/ ~/Library/LaunchAgents/com.torrenthub.plist

# 2. 删除 plist 文件
rm ~/Library/LaunchAgents/com.torrenthub.plist

# 3. （可选）清理日志
rm ~/Library/Logs/torrenthub.log ~/Library/Logs/torrenthub.err.log
```

---

## 一、技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端框架 | React 18 + TypeScript | 函数组件 + Hooks |
| 路由 | react-router-dom v7 | SPA |
| 数据请求 | @tanstack/react-query v5 | 缓存、轮询、批量失效 |
| 样式 | TailwindCSS 3 + lucide-react | 暗色工业仪表盘主题 |
| 构建工具 | Vite 6 | HMR、代理、生产打包 |
| 后端框架 | Express 4 + TypeScript | ESM |
| 实时推送 | ws（WebSocket）+ SSE（日志流） | 客户端状态、告警、活动事件 |
| 定时调度 | setInterval | 健康轮询、重连退避（支持任意可配置间隔） |
| 文件上传 | multer（内存存储） | .torrent 文件 |
| 日志 | pino + pino-pretty | 结构化日志 |
| 存储 | JSON 文件（`.torrenthub/config.json`） | 零原生编译依赖 |
| 进程启动 | Node 18+ 原生 fetch | 无需 axios |

---

## 二、目录结构

```
torrenthub/
├── bin/
│   └── torrenthub.js          # CLI 入口（无扩展名导入，兼容 tsc 编译与 tsx 加载）
├── api/                       # 后端 (Express + TS)
│   ├── app.ts                 # Express 装配（中间件 + 路由 + 静态托管）
│   ├── server.ts             # HTTP 服务启动、WS 初始化、监测调度器启动
│   ├── config.ts             # 数据目录、默认端口、轮询间隔等
│   ├── db.ts                  # JSON 存储层（客户端/告警/活动/规则/设置）
│   ├── logger.ts             # pino 日志 + 订阅推送
│   ├── monitor.ts             # 故障监测调度器（健康检查、重连退避、死种检测）
│   ├── ws.ts                  # WebSocket 广播中心
│   ├── adapters/              # 客户端适配器（核心抽象）
│   │   ├── types.ts           # ClientAdapter 接口
│   │   ├── qbittorrent.ts     # qBittorrent Web API v2 适配（含 5.2+ 兼容）
│   │   ├── transmission.ts    # Transmission RPC 适配
│   │   └── registry.ts        # 适配器注册中心 + 连接管理
│   └── routes/                # REST 路由（按资源拆分）
│       ├── clients.ts         # 客户端实例 CRUD + 测试连接 + 重连
│       ├── torrents.ts        # 跨客户端种子聚合 + 批量操作
│       ├── trackers.ts        # Tracker 聚合 + 批量增删改 + 正则替换
│       ├── monitor.ts         # 告警查询/状态流转 + 规则开关
│       ├── dashboard.ts       # 总览聚合统计
│       ├── settings.ts        # 全局设置读写
│       └── proxy.ts           # 原客户端 API 透传（"全部 API"）
├── shared/
│   └── types.ts               # 前后端共享类型契约
├── src/                       # 前端 (React + Vite)
│   ├── App.tsx                # 路由表 + QueryClient
│   ├── main.tsx               # 入口
│   ├── index.css              # Tailwind + 设计 token
│   ├── assets/                # 静态资源
│   ├── components/
│   │   ├── layout/            # Layout / Sidebar / Topbar
│   │   └── ui/                # Badges / Empty / ProgressBar
│   ├── lib/
│   │   ├── api.ts             # 统一 fetch 封装 + API 字典
│   │   ├── format.ts          # 速度/体积/时间格式化
│   │   └── utils.ts           # cn() 类名合并
│   └── pages/                 # 七大业务页面
│       ├── Dashboard.tsx      # 总览驾驶舱
│       ├── Clients.tsx        # 客户端管理
│       ├── Torrents.tsx      # 种子中心
│       ├── AddTorrent.tsx     # 添加种子
│       ├── Trackers.tsx      # Tracker 工作台
│       ├── Monitor.tsx       # 故障监测
│       └── Settings.tsx      # 设置 + 实时日志
├── dist/
│   ├── assets/                # 前端生产构建产物（Vite build）
│   ├── index.html             # 前端入口
│   ├── favicon.svg            # 图标
│   └── server/                # 后端编译产物（tsc -p tsconfig.server.json）
│       ├── api/               # 编译后的 TS → JS
│       ├── shared/
│       └── bin/
│           └── torrenthub.js  # CLI 入口（cp 自 bin/）
├── public/                    # favicon
├── .torrenthub-data/          # 本地数据目录（dev）
│   └── config.json            # 全部持久化数据
├── package.json
├── tsconfig.json              # 前端 + 通用配置（noEmit:true）
├── tsconfig.server.json       # 后端单独编译配置（输出到 dist/server/）
├── vite.config.ts             # 开发代理 /api → 3001
├── tailwind.config.js
└── README.md
```

---

## 三、整体架构

```
┌─────────────────────────── 浏览器 ───────────────────────────┐
│  React SPA (Vite dev :5173 / prod 由 Express 托管 :7878)     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Dashboard│  │ Torrents │  │ Trackers │  │ Monitor  │ ...  │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘      │
│        └──────────┬──┴─────────────┴────────────┘            │
│              src/lib/api.ts (统一 fetch)                       │
│              ┌─────────────────────────┐                      │
│              │  WebSocket /ws (实时)    │                      │
└──────────────┼─────────────────────────┼──────────────────────┘
               │ /api/* (REST)           │
┌──────────────▼─────────────────────────▼──────────────────────┐
│              Express App (api/app.ts)                         │
│  中间件：cors / json / multer(种子上传)                         │
│  ┌────────┬────────┬────────┬────────┬────────┬────────┐     │
│  │clients │torrents│trackers│monitor │dashboard│proxy │ ... │
│  └────┬───┴────┬───┴────┬───┴────┬───┴────┬───┴───┬──┘     │
│       │        │        │        │        │       │          │
│       └────────┴────────┴────────┴────────┴───────┘          │
│                  Adapters Registry                             │
│        ┌──────────────────┴──────────────────┐                │
│        ▼                                     ▼                │
│  QbittorrentAdapter                  TransmissionAdapter       │
│  (Cookie + Web API v2, 5.2+ 兼容)  (Basic + RPC + 409 重试)  │
└────────┬─────────────────────────────────────┬────────────────┘
         │                                     │
         ▼                                     ▼
   qBittorrent 实例                      Transmission 实例
   (http://host:8080)                    (http://host:9091)

┌──────────────── 并行后台任务 ────────────────┐
│  monitor.ts (setInterval 每 10 分钟)             │
│   ├ 健康检查 → getVersion()                   │
│   ├ 指数退避重连 (2^n * 1000ms, max 5 次)      │
│   └ 告警写入 + WebSocket 广播                 │
└──────────────────────────────────────────────┘

┌──────────────── 并行后台任务 ────────────────┐
│  monitor.ts (setInterval 每小时)                │
│   └ 死种检测 (无速度 N 小时告警)              │
└──────────────────────────────────────────────┘

┌──────────────── 持久化 ────────────────┐
│  db.ts → .torrenthub/config.json       │
│  防抖 200ms 落盘 + 进程退出同步落盘     │
└────────────────────────────────────────┘
```

**关键设计点**：

1. **适配器模式**：`ClientAdapter` 接口屏蔽两类客户端差异，上层路由只调接口方法，新增客户端类型只需实现接口。
2. **透传兜底**：`/api/proxy/:clientId/*` 直通原客户端任意 API，覆盖适配器未封装的"全部 API"。
3. **跨客户端聚合**：种子、Tracker、仪表盘均并发请求多个客户端后聚合，单点失败不影响整体。
4. **JSON 存储**：本地工具数据量小，JSON 零原生依赖、易备份、易调试。
5. **编译后端（生产）**：`npm run build:server` 用 tsc 将 TS 编译为纯 JS 产物（`dist/server/`），启动时直接 `node` 运行,消除 tsx 实时转译的 loader hook 开销,大幅降低长期运行的 CPU 与内存占用。

---

## 四、后端模块详解

### 4.1 入口与启动

#### [bin/torrenthub.js](file:///Users/caofuguang/TraeProject/torrenthub/bin/torrenthub.js)
CLI 入口。解析 `--port / --host / --no-browser`，调用 `startServer()`，成功后用 `open` 自动拉起浏览器。

采用无扩展名相对路径导入（`from '../api/server.js'`），使得同一份源码既可由 tsx 在开发模式加载，又可由 tsc 编译后的 JS 直接运行。

```bash
torrenthub                      # 默认 127.0.0.1:7878
torrenthub --port 9000
torrenthub --host 0.0.0.0 --no-browser
torrenthub --help
```

#### [api/server.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/server.ts)
启动序列：
1. `initDb()` 加载/初始化 JSON 存储
2. `createApp()` 装配 Express
3. `initWebSocket(server)` 挂载 `/ws`
4. `startMonitor()` 启动 setInterval 健康调度（可配置间隔）
5. `server.listen(port, host)`
6. `connectAll()` 并发测试所有已存客户端

#### [api/app.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/app.ts)
Express 装配中心：
- `cors()` + `express.json({limit:'50mb'})`（容纳 base64 种子）
- `multer.memoryStorage()` 处理 `.torrent` 文件上传
- 7 组 REST 路由 + `/api/health` + `/api/logs`(SSE)
- 生产模式托管 `dist/` 静态前端（SPA fallback）
- 全局错误处理 + 404

#### [api/config.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/config.ts)
集中配置：
- `TORRENTHUB_DATA_DIR` 环境变量可覆盖数据目录（默认 `~/.torrenthub`）
- 默认端口 7878、默认 host 127.0.0.1
- **健康检查间隔 10 分钟**（`healthCheckIntervalSec: 600`）、**死种检测间隔 1 小时**（`deadSeedCheckIntervalSec: 3600`）
- 活动保留 200 条、告警保留 30 天

---

### 4.2 适配器层（核心）

#### [api/adapters/types.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/adapters/types.ts)
定义 `ClientAdapter` 接口，统一两类客户端行为：

| 方法 | 作用 |
|---|---|
| `login()` | 建立会话（qB 取 Cookie，Tr 取 Session-Id） |
| `test()` | 测试连接并返回版本 |
| `getVersion()` | 获取客户端版本 |
| `getTorrents()` | 拉取种子列表 → 统一为 `UnifiedTorrent` |
| `getTorrentDetails(hash)` | 文件 / Peer / Tracker 详情 |
| `addTorrent(source, opts)` | 添加种子（magnet / url / file） |
| `deleteTorrents(hashes, deleteFiles)` | 删除，可选删数据 |
| `pauseTorrents` / `resumeTorrents` | 暂停 / 恢复 |
| `setFilePriority(hash, indices, pri)` | 文件优先级 |
| `addTracker` / `replaceTracker` / `removeTracker` | Tracker 增删改 |
| `getFreeSpace()` | 可用磁盘 |
| `raw(path, opts)` | 原始 API 透传 |

`AdapterError` 携带 `code`（`NETWORK_ERROR` / `AUTH_FAILED` / `FORBIDDEN` / `API_ERROR` / `RPC_ERROR` / `NOT_FOUND`）便于上层分级处理。

#### [api/adapters/qbittorrent.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/adapters/qbittorrent.ts)
qBittorrent Web API v2 适配：
- **认证（5.2 兼容）**：POST `/api/v2/auth/login`，5.2+ 版本返回 `204 No Content`（空 body），旧版返回 `200 + Ok.`；两种响应均判定成功，并提取 `Set-Cookie`
- 403 时清空 Cookie 并抛 `FORBIDDEN`
- `ensureAuth()` 懒登录
- 状态映射：`state` 字段（downloading/uploading/pausedDL/...）→ 统一 `TorrentStatus`
- Tracker 状态码 0-4 → `disabled/not_yet_contacted/working/updating/not_working`
- 添加种子：FormData（magnet 走 `urls`，文件走 `torrents` blob）
- 透传：直接拼路径 + query 转发

#### [api/adapters/transmission.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/adapters/transmission.ts)
Transmission RPC 适配：
- 认证：HTTP Basic + `X-Transmission-Session-Id`
- **409 重试**：首次请求拿 Session-Id 后自动重发（RPC 协议要求）
- `torrent-get` 指定 `fields` 拉所需字段
- 状态码 0-5 → 统一状态（结合 `error` / `isFinished`）
- Tracker 操作：`trackerAdd` / `trackerRemove`（按索引删，需先查详情匹配 URL）
- `replaceTracker` 实现：先 remove 再 add（Tr 无原生 replace）
- 透传：`raw(method, {body: args})` 直接走 RPC

#### [api/adapters/registry.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/adapters/registry.ts)
适配器注册中心：
- `Map<clientId, ClientAdapter>` 缓存实例
- `getAdapter(id)` 懒加载：缓存未命中则从 DB 取 client 配置创建
- `refreshAdapter(id)` 配置变更后重建
- `connectClient(id)` 测试连接，成功更新 `status=online` + `version` + `lastSeen`
- `connectAll()` 启动时并发连接所有
- `testConnection(data)` 临时适配器测试（不落库）
- `recordActivity` / `recordAlert` 桥接 DB

---

### 4.3 路由层

#### [api/routes/clients.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/routes/clients.ts) — 客户端实例管理

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/clients` | 列出所有客户端 |
| GET | `/api/clients/:id` | 单个详情 |
| POST | `/api/clients/test` | 测试连接（不入库） |
| POST | `/api/clients` | 添加，异步触发连接 |
| PUT | `/api/clients/:id` | 更新，刷新适配器 |
| DELETE | `/api/clients/:id` | 删除，移除适配器 |
| GET | `/api/clients/:id/version` | 拉版本 |
| POST | `/api/clients/:id/reconnect` | 手动重连 |

#### [api/routes/torrents.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/routes/torrents.ts) — 种子管理（跨客户端）

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/torrents` | 聚合多客户端种子，支持 `clientId/status/search` 过滤 |
| GET | `/api/torrents/:clientId/:hash` | 单种子详情（文件/Peer/Tracker） |
| POST | `/api/torrents` | 添加种子（多客户端分发，返回逐个结果） |
| DELETE | `/api/torrents` | 批量删除（按 clientId 分组） |
| PATCH | `/api/torrents/state` | 批量暂停/恢复 |
| POST | `/api/torrents/:clientId/:hash/files/priority` | 文件优先级 |
| POST/PUT/DELETE | `/api/torrents/:clientId/:hash/trackers` | 单种子 Tracker 增改删 |

聚合逻辑：`Promise.allSettled` 并发拉取，单点失败仅 warn 不阻塞，结果按 `addedOn` 倒序。

#### [api/routes/trackers.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/routes/trackers.ts) — Tracker 工作台

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/trackers` | 跨客户端 Tracker 聚合（URL → 种子数/客户端列表） |
| POST | `/api/trackers/batch` | 批量增/删/改，支持正则替换 + 预览模式 |

正则替换：`replace.from` 作为正则源，匹配种子所有 Tracker，`replace.to` 支持 `$1` 反向引用。预览模式 `previewOnly:true` 只返回影响范围不执行。

#### [api/routes/monitor.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/routes/monitor.ts) — 故障监测

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/monitor/alerts` | 告警列表（最新 100） |
| PATCH | `/api/monitor/alerts/:id` | 流转状态（open → acknowledged → resolved） |
| GET | `/api/monitor/rules` | 监测规则列表 |
| PUT | `/api/monitor/rules` | 批量更新规则（开关 + 参数） |

#### [api/routes/dashboard.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/routes/dashboard.ts) — 总览
聚合所有客户端的种子数、活动数、上下行速度、磁盘可用、健康分（100 起，错误种子 -5/个，无活动 -20）。返回最近 20 条活动事件。

#### [api/routes/proxy.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/routes/proxy.ts) — 原 API 透传
覆盖"全部 API"需求的兜底通道：

- qBittorrent：`ALL /api/proxy/:clientId/qbittorrent/*` 直接拼路径转发（保留 query/body/form）
- Transmission：`POST /api/proxy/:clientId/transmission`，body `{method, arguments}` 走 RPC

类型校验：qB 透传要求适配器 type 为 qbittorrent，Tr 透传同理。

#### [api/routes/settings.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/routes/settings.ts) — 设置
读写键值对：`port / host / authEnabled / authToken / theme / openBrowserOnStart` 等。

---

### 4.4 后台服务

#### [api/monitor.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/monitor.ts) — 故障监测调度器
使用两个独立的 `setInterval` 任务，将健康检查与死种检测解耦，支持任意可配置间隔（config.ts 中配置秒数）：

1. **健康检查（每 10 分钟）**：对每个客户端调 `adapter.getVersion()`（轻量请求）
   - 成功且原状态非 online → 更新 online + 广播 `client:status`
   - 失败 → 重试计数 +1，`setTimeout(2^n * 1000ms)` 后重连
   - 超过 `maxRetry`(5) → 标记 offline + 广播 + 创建 critical 告警
2. **死种检测（每小时）**：在线客户端遍历种子，`downloading + 速度为 0 + 超过 noPeerHours(24h)` → warning 告警
3. **去重**：同 client + 同 event + 同 hash 的 open 告警不重复创建

> 原实现使用 `node-cron` 库，已替换为 `setInterval` 以支持任意可配置间隔（cron 表达式不支持 `*/600` 这种大粒度）。

#### [api/ws.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/ws.ts) — WebSocket 推送
- 路径 `/ws`，连接时下发 `{type:'connected'}`
- `broadcast(message)` 推送给所有 OPEN 客户端
- 消息类型：`torrent:update` / `alert:new` / `client:status` / `activity`

#### [api/db.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/db.ts) — JSON 存储层
- 单文件 `.torrenthub/config.json`，结构：`{clients, alerts, activities, rules, settings}`
- **密码 Base64 编码**存储（`password_enc`），读取时解码（非加密，仅避免明文）
- **防抖落盘**：写操作只触发 200ms 后的定时持久化，避免高频 IO
- **进程退出兜底**：`SIGINT/SIGTERM/exit` 同步落盘
- 启动时 `seedDefaults()` 注入 4 条默认监测规则 + 默认设置
- 活动保留最近 200 条自动裁剪

#### [api/logger.ts](file:///Users/caofuguang/TraeProject/torrenthub/api/logger.ts)
pino 结构化日志 + `subscribeLogs(cb)` 订阅，供 `/api/logs` SSE 推送给前端实时显示。

> 生产模式（`NODE_ENV=production`）输出 JSON 行；未设置时输出彩色 pretty 日志。

---

## 五、前端模块详解

### 5.1 入口与路由

#### [src/App.tsx](file:///Users/caofuguang/TraeProject/torrenthub/src/App.tsx)
- `QueryClientProvider` 包裹，默认 `refetchOnWindowFocus:false, retry:1`
- `BrowserRouter` + 7 个路由
- `Layout` 提供侧栏 + 顶栏 + 内容区

路由表：

| 路径 | 页面 | 功能 |
|---|---|---|
| `/dashboard` | Dashboard | 总览驾驶舱 |
| `/clients` | Clients | 客户端管理 |
| `/torrents` | Torrents | 种子中心 |
| `/torrents/add` | AddTorrent | 添加种子 |
| `/trackers` | Trackers | Tracker 工作台 |
| `/monitor` | Monitor | 故障监测 |
| `/settings` | Settings | 设置 + 日志 |

### 5.2 布局组件

#### [src/components/layout/Sidebar.tsx](file:///Users/caofuguang/TraeProject/torrenthub/src/components/layout/Sidebar.tsx)
72px 窄侧栏，霓虹绿高亮当前路由，lucide 图标 + 中文标签。

#### [src/components/layout/Topbar.tsx](file:///Users/caofuguang/TraeProject/torrenthub/src/components/layout/Topbar.tsx)
顶栏：客户端切换器、全局搜索、实时状态指示。

### 5.3 数据层

#### [src/lib/api.ts](file:///Users/caofuguang/TraeProject/torrenthub/src/lib/api.ts)
统一 `request<T>()` 封装：
- 自动加 `Content-Type: application/json`
- 解析 JSON，`!res.ok || success===false` 抛错
- 暴露 `api` 字典，覆盖全部后端接口

#### [src/lib/format.ts](file:///Users/caofuguang/TraeProject/torrenthub/src/lib/format.ts)
速度（KB/s → MB/s → GB/s）、体积、ETA、时间格式化。

### 5.4 业务页面

#### [src/pages/Dashboard.tsx](file:///Users/caofuguang/TraeProject/torrenthub/src/pages/Dashboard.tsx) — 总览驾驶舱
- 聚合统计卡：总种子数 / 活动数 / 总下载速度 / 总上传速度 / 可用磁盘
- 每客户端健康环（SVG，0-100 分）
- 速度趋势图（SVG）
- 最近活动流（20 条）

#### [src/pages/Clients.tsx](file:///Users/caofuguang/TraeProject/torrenthub/src/pages/Clients.tsx) — 客户端管理
- 卡片列表：名称、类型、URL、状态徽章、版本、最后在线时间
- 添加/编辑表单：名称、类型(qbittorrent/transmission)、URL、用户名、密码
- **测试连接**按钮：调 `/api/clients/test` 预验
- **重连**按钮：调 `/api/clients/:id/reconnect`
- 删除：移除适配器 + DB 记录

操作流程：
1. 点"添加客户端" → 填表单 → 先点"测试连接"确认凭证 → 保存
2. 保存后后端异步连接，状态从 offline → online
3. 离线客户端可点"重连"

#### [src/pages/Torrents.tsx](file:///Users/caofuguang/TraeProject/torrenthub/src/pages/Torrents.tsx) — 种子中心
- 跨客户端表格：名称、客户端、大小、进度条、状态徽章、速度、比率、ETA
- 顶部过滤：客户端选择、状态过滤、搜索框
- 行多选 + 批量操作：暂停 / 恢复 / 删除（可选删数据）
- 点击行 → 抽屉详情：文件列表（可改优先级）、Peer 列表、Tracker 列表

#### [src/pages/AddTorrent.tsx](file:///Users/caofuguang/TraeProject/torrenthub/src/pages/AddTorrent.tsx) — 添加种子
- 来源三选一：磁链 / URL / 文件上传（.torrent）
- 目标客户端多选（分发到多个客户端）
- 选项：保存路径、是否暂停、分类、标签、限速
- 提交后逐客户端返回成功/失败结果

#### [src/pages/Trackers.tsx](file:///Users/caofuguang/TraeProject/torrenthub/src/pages/Trackers.tsx) — Tracker 工作台
- 聚合视图：每个 Tracker URL 对应的种子数、覆盖客户端
- 批量操作：选中多个种子 → 增 / 删 / 改
- **正则替换**：`from` 支持正则，`to` 支持 `$1` 反向引用
- **预览模式**：先看影响范围再决定执行

#### [src/pages/Monitor.tsx](file:///Users/caofuguang/TraeProject/torrenthub/src/pages/Monitor.tsx) — 故障监测
- 告警时间线：按时间倒序，level 颜色区分（info/warning/error/critical）
- 告警状态流转：open → acknowledged → resolved
- 规则开关面板：死种检测 / Tracker 失效 / 磁盘水位 / 客户端断连重试
- 每条规则可编辑参数（如 `noPeerHours`、`failThreshold`、`warnPercent`）

#### [src/pages/Settings.tsx](file:///Users/caofuguang/TraeProject/torrenthub/src/pages/Settings.tsx) — 设置
- 服务配置：端口、host、主题、启动是否开浏览器
- 实时日志面板：SSE 订阅 `/api/logs`，pino 输出实时滚动

---

## 六、支持的功能清单

### 6.1 客户端管理
- 添加 qBittorrent / Transmission 实例（多实例）
- 测试连接预验
- 编辑凭证、删除
- 手动重连
- 自动健康检查 + 指数退避重连

### 6.2 种子管理
- 跨客户端聚合查看
- 按客户端 / 状态 / 关键词过滤
- 添加：磁链 / URL / .torrent 文件
- 多客户端分发添加
- 批量暂停 / 恢复 / 删除（可选删数据）
- 单种子详情：文件 / Peer / Tracker
- 文件优先级调整（skip / normal / high）

### 6.3 Tracker 管理
- 跨客户端 Tracker 聚合统计
- 单种子 Tracker 增 / 删 / 改
- 批量操作（多种子）
- 正则替换（支持 `$1` 反向引用）
- 预览模式（先看影响再执行）

### 6.4 故障监测
- 健康轮询（10 分钟间隔）
- 死种检测（1 小时间隔）
- 客户端离线告警（critical 级）
- 磁盘水位告警
- Tracker 失效检测
- 告警状态流转（open → acknowledged → resolved）
- 规则开关与参数调整

### 6.5 全 API 透传
- qBittorrent：`/api/proxy/:id/qbittorrent/*` 直通 Web API v2 任意端点
- Transmission：`POST /api/proxy/:id/transmission` 直通任意 RPC method
- 适配器未封装的能力均可经此通道调用

### 6.6 实时与可视化
- WebSocket 推送：客户端状态、新告警、种子更新、活动事件
- SSE 日志流：实时滚动 pino 日志
- 仪表盘：聚合统计 + 健康环 + 趋势图
- 活动流：最近 200 条操作记录

---

## 七、操作方式

### 7.1 安装与启动

```bash
# 安装依赖
npm install

# 开发模式（前后端热重载，前端 5173 / 后端 3001）
npm run dev

# 生产构建前端
npm run build

# 生产构建后端（编译 TS → JS）
npm run build:server

# 生产启动（运行编译产物）
npm start
# 或
node dist/server/bin/torrenthub.js

# 全局安装后（生产需先 build:server）
npm link
torrenthub
```

### 7.2 CLI 参数

```bash
torrenthub                  # 默认 127.0.0.1:7878，自动开浏览器
torrenthub --port 9000      # 指定端口
torrenthub --host 0.0.0.0   # 监听所有地址（局域网可访问）
torrenthub --no-browser     # 不自动开浏览器
torrenthub --help           # 帮助
```

环境变量：
- `TORRENTHUB_DATA_DIR`：数据目录（默认 `~/.torrenthub`）
- `PORT` / `HOST`：端口与监听地址

### 7.3 典型使用流程

1. **启动服务**：终端执行 `npm run build && npm run build:server && npm start`，浏览器自动打开 `http://127.0.0.1:7878`
2. **添加客户端**：进入"客户端"页 → 添加 qBittorrent / Transmission 实例 → 测试连接 → 保存
3. **查看种子**：进入"种子"页，跨客户端聚合显示，可过滤/搜索/批量操作
4. **添加种子**：进入"添加种子"页，选来源（磁链/URL/文件）→ 选目标客户端 → 提交
5. **管理 Tracker**：进入"Tracker"页，聚合视图 → 批量增删改或正则替换
6. **监测故障**：进入"监测"页，查看告警时间线，调整规则参数
7. **查看日志**：进入"设置"页，实时日志面板滚动显示
8. **数据备份与迁移**：进入"设置"页 → 数据管理 → 导出数据（下载 JSON 备份）；在新机器上导入该文件恢复数据

### 7.4 API 工作台

侧边栏"API"页（`/api`）提供**全 API 浏览与在线测试**，无需外部工具：

| 功能 | 说明 |
|---|---|
| **API 列表** | 按"聚合平台 / 数据管理 / qBittorrent 透传 / Transmission 透传"分类展示 |
| **API 详情** | 点击任一项查看 HTTP 方法、路径、参数表（含必填标记、类型、示例） |
| **请求测试** | 输入 JSON 请求体 → 点击"发送请求" → 实时查看 HTTP 状态码、响应时间、返回结果 |
| **透传路径** | 需先选择在线客户端，路径中 `:clientId` 自动替换为所选客户端 ID |
| **复制 cURL** | 一键生成对应 cURL 命令，方便在其他终端调试 |
| **帮助提示** | 内置 API 调用格式说明，无需查阅外部文档 |

支持直接测试全部聚合 API、qBittorrent Web API v2 任意端点（含 5.2+ 兼容）、Transmission RPC 任意方法。

### 7.5 透传调用示例

直接调用原客户端任意 API（适配器未封装的能力）：

```bash
# qBittorrent：获取应用偏好设置
curl http://127.0.0.1:7878/api/proxy/<clientId>/qbittorrent/api/v2/app/preferences

# qBittorrent：设置上传限速
curl -X POST http://127.0.0.1:7878/api/proxy/<clientId>/qbittorrent/api/v2/transfer/setUploadLimit \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "limit=102400"

# Transmission：获取会话统计
curl -X POST http://127.0.0.1:7878/api/proxy/<clientId>/transmission \
  -H "Content-Type: application/json" \
  -d '{"method":"session-stats","arguments":{}}'

# Transmission：修改会话配置
curl -X POST http://127.0.0.1:7878/api/proxy/<clientId>/transmission \
  -H "Content-Type: application/json" \
  -d '{"method":"session-set","arguments":{"speed-limit-down":1000}}'
```

### 7.6 数据导入导出

前端"设置"页"数据管理"区域提供完整备份与恢复：

| 操作 | 说明 |
|---|---|
| **导出数据** | 下载 JSON 文件（`torrenthub-backup-YYYY-MM-DD.json`），含客户端、告警、活动、规则、设置 |
| **导入数据** | 上传之前导出的备份文件，支持"合并"（默认，仅合并不冲突项）或"覆盖" |
| **自动备份** | 导入前会自动将当前数据备份至 `config.json.bak` |
| **查看路径** | 界面显示当前配置目录与数据文件路径，便于手动备份 |

**数据迁移流程**：
1. 原机器：设置页 → 数据管理 → 导出数据，保存 JSON 文件
2. 新机器：设置页 → 数据管理 → 导入数据，选择文件，选择合并/覆盖模式

**导入格式**：

```json
{
  "version": "1.0",
  "exportedAt": 1783258466157,
  "data": {
    "clients": [...],
    "alerts": [...],
    "activities": [...],
    "rules": [...],
    "settings": {}
  }
}
```

---

## 八、数据存储

### 8.1 存储位置
- 默认：`~/.torrenthub/config.json`
- 开发模式：`.torrenthub-data/config.json`（项目内，便于调试）
- 可通过 `TORRENTHUB_DATA_DIR` 覆盖

### 8.2 数据结构

```json
{
  "clients": [
    {
      "id": "lx3a1b",
      "name": "家庭 qB",
      "type": "qbittorrent",
      "url": "http://192.168.1.10:8080",
      "username": "admin",
      "password_enc": "YWRtaW4=",  // Base64
      "status": "online",
      "version": "v4.6.5",
      "created_at": 1719700000000,
      "last_seen": 1719700015000
    }
  ],
  "alerts": [
    {
      "id": "alert_xxx",
      "client_id": "lx3a1b",
      "level": "critical",
      "event": "客户端离线",
      "detail": "...",
      "status": "open",
      "created_at": 1719700000000
    }
  ],
  "activities": [
    { "id": "...", "client_id": "...", "event_type": "client_added", "payload": "{}", "created_at": 0 }
  ],
  "rules": [
    { "id": "dead-seed", "name": "死种检测", "rule_type": "dead_seed", "config": "{\"noPeerHours\":24}", "enabled": true }
  ],
  "settings": {
    "port": "7878",
    "host": "127.0.0.1",
    "theme": "dark"
  }
}
```

### 8.3 写入策略
- 防抖 200ms 落盘（高频写合并）
- 进程退出（`SIGINT/SIGTERM/exit`）同步落盘
- 活动自动裁剪至最近 200 条

---

## 九、默认监测规则

| 规则 ID | 名称 | 类型 | 默认参数 | 默认启用 |
|---|---|---|---|---|
| `dead-seed` | 死种检测 | `dead_seed` | `noPeerHours:24, noProgressHours:12` | 是 |
| `tracker-dead` | Tracker 失效 | `tracker_dead` | `failThreshold:3, intervalMin:15` | 是 |
| `disk-water` | 磁盘水位 | `disk_water` | `warnPercent:85, criticalPercent:95` | 是 |
| `client-reconnect` | 客户端断连重试 | `client_reconnect` | `maxRetry:5, backoffBaseSec:2` | 是 |

---

## 十、设计取舍

| 决策 | 理由 |
|---|---|
| JSON 文件而非 SQLite | 零原生编译依赖，本地工具数据量小，易备份易调试 |
| Base64 存密码而非加密 | 本地工具，避免密钥管理复杂度；非明文即可 |
| 适配器模式 | 屏蔽两类客户端 API 差异，便于扩展新客户端类型 |
| 透传路由 | 适配器无法覆盖全部 API，透传兜底满足"全部 API"需求 |
| setInterval 而非 node-cron | 支持任意可配置间隔（cron 表达式不支持大粒度如 10 分钟/1 小时） |
| WebSocket + SSE 双通道 | WS 推业务事件，SSE 推日志，职责分离 |
| 跨客户端聚合用 `Promise.allSettled` | 单点失败不阻塞整体，提升健壮性 |
| 防抖落盘 | 避免高频写 IO，活动写入合并 |
| 生产运行编译产物 | 编译后端 TS → JS（`dist/server/`），消除 tsx 实时转译的 loader hook 开销，降低长期运行的 CPU 与内存占用 |
| 编译产物用无扩展名导入 | 同一份源码既可由 tsx 热加载，又可由 tsc 编译后直接 `node` 运行 |

---

## 十一、开发与调试

### 11.1 开发模式
```bash
# 前后端热重载（前端 5173 / 后端 3001）
npm run dev

# 仅后端热重载（前端用编译后的 dist/，Express :7878 托管）
npm run start:dev
# 或直接用 tsx
tsx bin/torrenthub.js
```

### 11.2 类型检查
```bash
npm run check    # tsc --noEmit
npm run lint     # eslint
```

### 11.3 查看存储数据
直接读取 `~/.torrenthub/config.json`（或开发模式 `.torrenthub-data/config.json`），JSON 格式可直接编辑。

### 11.4 查看日志
- 终端：pino-pretty 彩色输出
- 前端：设置页实时日志面板（SSE）

---

## 十二、API 速查表

| 资源 | 方法 | 路径 |
|---|---|---|
| 健康 | GET | `/api/health` |
| 仪表盘 | GET | `/api/dashboard` |
| 客户端 | GET/POST | `/api/clients` |
| 客户端 | GET/PUT/DELETE | `/api/clients/:id` |
| 测试连接 | POST | `/api/clients/test` |
| 重连 | POST | `/api/clients/:id/reconnect` |
| 种子列表 | GET | `/api/torrents` |
| 种子详情 | GET | `/api/torrents/:clientId/:hash` |
| 添加种子 | POST | `/api/torrents` |
| 删除种子 | DELETE | `/api/torrents` |
| 暂停/恢复 | PATCH | `/api/torrents/state` |
| 文件优先级 | POST | `/api/torrents/:clientId/:hash/files/priority` |
| 单种子 Tracker | POST/PUT/DELETE | `/api/torrents/:clientId/:hash/trackers` |
| Tracker 聚合 | GET | `/api/trackers` |
| Tracker 批量 | POST | `/api/trackers/batch` |
| 告警 | GET | `/api/monitor/alerts` |
| 告警流转 | PATCH | `/api/monitor/alerts/:id` |
| 规则 | GET/PUT | `/api/monitor/rules` |
| 设置 | GET/PUT | `/api/settings` |
| 日志流 | GET(SSE) | `/api/logs` |
| WebSocket | WS | `/ws` |
| qB 透传 | ALL | `/api/proxy/:clientId/qbittorrent/*` |
| Tr 透传 | POST | `/api/proxy/:clientId/transmission` |

---

## 十三、扩展指南

### 13.1 新增客户端类型
1. 在 [shared/types.ts](file:///Users/caofuguang/TraeProject/torrenthub/shared/types.ts) 的 `ClientType` 加新类型
2. 实现 `ClientAdapter` 接口，新建 `api/adapters/xxx.ts`
3. 在 `registry.ts` 的 `createAdapter` 加分支
4. 前端 `Clients.tsx` 类型下拉框加选项

### 13.2 新增监测规则
1. 在 `db.ts` 的 `seedDefaults` 加默认规则
2. 在 `monitor.ts` 的 `runHealthCheck` 或独立 cron 任务加检测逻辑
3. 前端 `Monitor.tsx` 规则面板自动渲染（通用化）

### 13.3 新增前端页面
1. 在 `src/pages/` 新建组件
2. 在 `App.tsx` 加路由
3. 在 `Sidebar.tsx` 加导航项
4. 在 `lib/api.ts` 加对应 API 方法

---

## 十四、Windows 分发包

### 14.1 打包方法

在开发机器上运行：

```bash
npm run package:windows
```

此命令会依次执行：

1. `npm run build` — 编译前端 Vite 产物（`dist/assets/`, `dist/index.html`, `dist/favicon.svg`）
2. `npm run build:server` — 编译后端 TypeScript（`dist/server/`）并复制 `bin/` 到编译目录
3. `node scripts/build-windows.js` — 将编译产物打包为 ZIP

**输出文件**：`dist/TorrentHub-win-x64.zip`

### 14.2 ZIP 包内容

```
TorrentHub-win-x64.zip
├── assets/                 # 编译后的前端资源（CSS、JS）
├── index.html              # 前端入口
├── favicon.svg
├── bin/
│   └── torrenthub.js       # 生产入口（无扩展名导入）
├── server/                 # 编译后的后端 JS
│   ├── api/
│   ├── bin/
│   └── shared/
├── package.json            # 精简生产版（仅含生产依赖）
├── package-lock.json       # 锁定依赖版本
├── torrenthub.cmd          # Windows 启动脚本（双击即可运行）
└── README.md               # Windows 安装说明
```

### 14.3 Windows 安装与运行

```cmd
REM 1. 解压 ZIP
tar -xf TorrentHub-win-x64.zip -C "C:\Program Files\"

REM 2. 安装生产依赖（仅首次）
cd "C:\Program Files\TorrentHub"
npm install --production

REM 3. 启动服务
npm start
REM 或双击 torrenthub.cmd
```

启动后在浏览器访问 http://127.0.0.1:7878

### 14.4 Windows 防火墙

```cmd
netsh advfirewall firewall add rule name="TorrentHub" dir=in action=allow protocol=TCP localport=7878
```

### 14.5 Windows 服务（开机自启）

使用 [nssm](https://nssm.cc/) 注册为 Windows 服务：

```cmd
nssm install TorrentHub "C:\Program Files\nodejs\node.exe" "C:\Program Files\TorrentHub\bin\torrenthub.js --no-browser"
nssm set TorrentHub AppDirectory "C:\Program Files\TorrentHub"
nssm start TorrentHub
```

### 14.6 打包脚本说明

- 打包脚本 [scripts/build-windows.js](file:///Users/caofuguang/TraeProject/torrenthub/scripts/build-windows.js) 使用纯 Node.js 实现 ZIP 压缩（无需外部依赖）
- 精简 `package.json` 仅包含生产依赖（`express`, `cors`, `multer`, `open`, `pino`, `pino-pretty`, `ws`），大幅减小包体积
- `torrenthub.cmd` 启动脚本默认携带 `--no-browser` 参数，避免 Windows 下自动开浏览器体验不佳；如需自动开浏览器，可修改 cmd 文件移除该参数

---

*文档版本：v0.1.0 · 对应 TorrentHub 版本*