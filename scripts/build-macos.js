/**
 * macOS 自包含打包脚本 - 生成包含 Node.js 运行时的独立分发包
 *
 * 包内容:
 *   - runtime/          内置 Node.js macOS 运行时（无需单独安装 Node.js）
 *   - server/           编译后的后端代码
 *   - shared/           共享类型
 *   - bin/              后端入口
 *   - assets/           前端静态资源
 *   - index.html        前端入口
 *   - package.json      生产依赖声明（首次启动自动安装）
 *   - torrenthub.command  双击启动脚本
 *   - install.command     手动依赖安装脚本
 *   - com.torrenthub.plist  launchd 开机自启模板
 *   - README.md         安装说明
 *
 * 使用方法:
 *   node scripts/build-macos.js
 *
 * 前置条件:
 *   1. 已执行 npm run build (构建前端)
 *   2. 已执行 npm run build:server (编译后端)
 *
 * 输出:
 *   dist/TorrentHub-macos-{arch}.tar.gz
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// 检测架构：arm64 -> arm64，x64 -> x64
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64';
const ARCH_LABEL = ARCH === 'arm64' ? 'Apple Silicon' : 'Intel';

const OUTPUT_DIR = path.join(ROOT, 'dist', 'macos-package');
const PKG_DIR_NAME = `TorrentHub-macos-${ARCH}`;
const TAR_NAME = `TorrentHub-macos-${ARCH}.tar.gz`;
const TAR_PATH = path.join(ROOT, 'dist', TAR_NAME);

// Node.js macOS 运行时
const NODE_VERSION = 'v20.18.1';
const NODE_TARBALL = `node-${NODE_VERSION}-darwin-${ARCH}.tar.gz`;
const NODE_URL = `https://nodejs.org/dist/${NODE_VERSION}/${NODE_TARBALL}`;
const NODE_EXTRACT_DIR = `/tmp/node-macos-extract`;
const NODE_RUNTIME_SRC = path.join(NODE_EXTRACT_DIR, `node-${NODE_VERSION}-darwin-${ARCH}`);

// ============================================================
// 工具函数
// ============================================================

function mkdirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFileSync(src, dst) {
  mkdirSync(path.dirname(dst));
  fs.copyFileSync(src, dst);
  // 保留执行权限
  try {
    const stat = fs.statSync(src);
    fs.chmodSync(dst, stat.mode);
  } catch { /* ignore */ }
}

function copyDirSync(src, dst) {
  mkdirSync(dst);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
    }
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================================
// 下载 Node.js macOS 运行时
// ============================================================

function ensureNodeRuntime() {
  if (fs.existsSync(path.join(NODE_RUNTIME_SRC, 'bin', 'node'))) {
    console.log(`[OK] Node.js macOS ${ARCH} 运行时已存在`);
    return;
  }
  console.log(`正在下载 Node.js macOS ${ARCH} (${ARCH_LABEL}) 运行时...`);
  const tarPath = `/tmp/node-macos-${ARCH}.tar.gz`;
  execSync(`curl -L --max-time 120 -o "${tarPath}" "${NODE_URL}"`, { stdio: 'inherit' });
  execSync(`rm -rf "${NODE_EXTRACT_DIR}" && mkdir -p "${NODE_EXTRACT_DIR}"`, { stdio: 'inherit' });
  execSync(`tar -xzf "${tarPath}" -C "${NODE_EXTRACT_DIR}"`, { stdio: 'inherit' });
  console.log('[OK] Node.js macOS 运行时下载完成');
}

// ============================================================
// 同步打包目录
// ============================================================

function syncPackage() {
  console.log(`正在构建 macOS ${ARCH} 自包含分发包...`);

  // 清理输出目录
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  mkdirSync(OUTPUT_DIR);

  // 1. 复制 Node.js 运行时（仅保留必要文件，减小体积）
  const runtimeDir = path.join(OUTPUT_DIR, 'runtime');
  mkdirSync(runtimeDir);
  // node 可执行文件
  copyFileSync(path.join(NODE_RUNTIME_SRC, 'bin', 'node'), path.join(runtimeDir, 'bin', 'node'));
  // npm 相关文件（用于首次安装依赖）
  copyDirSync(path.join(NODE_RUNTIME_SRC, 'lib', 'node_modules'), path.join(runtimeDir, 'lib', 'node_modules'));
  // 创建 npm/npx 包装脚本
  fs.writeFileSync(path.join(runtimeDir, 'bin', 'npm'), NPM_WRAPPER);
  fs.chmodSync(path.join(runtimeDir, 'bin', 'npm'), 0o755);
  fs.writeFileSync(path.join(runtimeDir, 'bin', 'npx'), NPX_WRAPPER);
  fs.chmodSync(path.join(runtimeDir, 'bin', 'npx'), 0o755);
  console.log(`[OK] runtime/ (Node.js macOS ${ARCH} 运行时)`);

  // 2. 复制后端编译产物（dist/server/ -> server/）
  copyDirSync(path.join(ROOT, 'dist', 'server', 'bin'), path.join(OUTPUT_DIR, 'server', 'bin'));
  copyDirSync(path.join(ROOT, 'dist', 'server', 'api'), path.join(OUTPUT_DIR, 'server', 'api'));
  copyDirSync(path.join(ROOT, 'dist', 'server', 'shared'), path.join(OUTPUT_DIR, 'server', 'shared'));
  console.log('[OK] server/ (后端编译产物)');

  // 3. 复制前端静态资源
  copyDirSync(path.join(ROOT, 'dist', 'assets'), path.join(OUTPUT_DIR, 'assets'));
  copyFileSync(path.join(ROOT, 'dist', 'index.html'), path.join(OUTPUT_DIR, 'index.html'));
  copyFileSync(path.join(ROOT, 'dist', 'favicon.svg'), path.join(OUTPUT_DIR, 'favicon.svg'));
  console.log('[OK] assets/ index.html favicon.svg (前端资源)');

  // 4. 生成生产 package.json（仅生产依赖）
  const prodPackage = {
    name: 'torrenthub',
    version: '0.1.0',
    type: 'module',
    bin: { torrenthub: 'server/bin/torrenthub.js' },
    scripts: { start: 'node server/bin/torrenthub.js --no-browser' },
    dependencies: {
      '@tanstack/react-query': '^5.51.0',
      clsx: '^2.1.1',
      cors: '^2.8.5',
      express: '^4.21.2',
      'lucide-react': '^0.511.0',
      multer: '^1.4.5-lts.1',
      open: '^10.1.0',
      pino: '^9.5.0',
      'pino-pretty': '^11.2.2',
      'react': '^18.3.1',
      'react-dom': '^18.3.1',
      'react-router-dom': '^7.3.0',
      ws: '^8.18.0',
    },
    engines: { node: '>=18' },
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'package.json'), JSON.stringify(prodPackage, null, 2));
  console.log('[OK] package.json (生产依赖声明)');

  // 5. 创建启动脚本
  const launcherPath = path.join(OUTPUT_DIR, 'torrenthub.command');
  const installPath = path.join(OUTPUT_DIR, 'install.command');
  fs.writeFileSync(launcherPath, LAUNCHER_COMMAND);
  fs.chmodSync(launcherPath, 0o755);
  fs.writeFileSync(installPath, INSTALL_COMMAND);
  fs.chmodSync(installPath, 0o755);
  console.log('[OK] torrenthub.command install.command (启动脚本)');

  // 6. 生成 launchd plist 模板
  fs.writeFileSync(path.join(OUTPUT_DIR, 'com.torrenthub.plist'), LAUNCHD_PLIST);
  console.log('[OK] com.torrenthub.plist (开机自启模板)');

  // 7. 生成 README
  fs.writeFileSync(path.join(OUTPUT_DIR, 'README.md'), MACOS_README);
  console.log('[OK] README.md (安装说明)');

  console.log('');
}

// ============================================================
// tar.gz 压缩（保留文件权限和符号链接）
// ============================================================

function tarPackage() {
  console.log('正在压缩 tar.gz（保留文件权限）...');

  // 删除旧包
  if (fs.existsSync(TAR_PATH)) {
    fs.rmSync(TAR_PATH);
  }

  // 重命名目录为最终包名
  const finalDir = path.join(path.dirname(OUTPUT_DIR), PKG_DIR_NAME);
  if (fs.existsSync(finalDir)) {
    fs.rmSync(finalDir, { recursive: true });
  }
  fs.renameSync(OUTPUT_DIR, finalDir);

  // 使用 tar 打包（保留权限）
  const parentDir = path.dirname(finalDir);
  const dirName = path.basename(finalDir);
  execSync(`cd "${parentDir}" && tar -czf "${TAR_PATH}" "${dirName}"`, { stdio: 'inherit' });

  const size = fs.statSync(TAR_PATH).size;
  console.log(`[OK] tar.gz 已生成: ${TAR_NAME} (${formatSize(size)})`);

  // 清理临时目录
  fs.rmSync(finalDir, { recursive: true });
  console.log('[OK] 已清理临时文件');
}

// ============================================================
// 启动脚本内容
// ============================================================

const NPM_WRAPPER = `#!/bin/sh
DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec "$DIR/bin/node" "$DIR/lib/node_modules/npm/bin/npm-cli.js" "$@"
`;

const NPX_WRAPPER = `#!/bin/sh
DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec "$DIR/bin/node" "$DIR/lib/node_modules/npm/bin/npx-cli.js" "$@"
`;

const LAUNCHER_COMMAND = `#!/bin/bash
# TorrentHub macOS 启动脚本
cd "$(dirname "$0")"

echo ""
echo "================================"
echo "  TorrentHub - BT Client Manager"
echo "================================"
echo ""

# 检测 Node.js：优先使用内置运行时，其次系统 node
NODE_EXE=""
if [ -f "runtime/bin/node" ]; then
    NODE_EXE="runtime/bin/node"
    NPM_CMD="runtime/bin/npm"
    echo "[INFO] 使用内置 Node.js 运行时"
else
    if command -v node &> /dev/null; then
        NODE_EXE="node"
        NPM_CMD="npm"
        echo "[INFO] 使用系统 Node.js"
    fi
fi

if [ -z "$NODE_EXE" ]; then
    echo "[ERROR] 未找到 Node.js"
    echo ""
    echo "原因: runtime/bin/node 不存在（可能被删除）"
    echo ""
    echo "解决方案:"
    echo "  1. 通过 Homebrew 安装: brew install node"
    echo "  2. 从官网安装: https://nodejs.org"
    echo ""
    read -p "按回车键退出..."
    exit 1
fi

# 首次运行自动安装依赖
NEED_INSTALL=0
if [ ! -d "node_modules/open" ]; then NEED_INSTALL=1; fi
if [ ! -d "node_modules/express" ]; then NEED_INSTALL=1; fi

if [ "$NEED_INSTALL" = "1" ]; then
    echo "[首次运行] 正在安装依赖，请稍候..."
    echo ""
    "$NODE_EXE" "$NPM_CMD" install --production --no-audit --no-fund 2>&1 | tail -5
    if [ $? -ne 0 ]; then
        echo ""
        echo "[ERROR] 依赖安装失败"
        echo "请检查网络连接后重试，或手动运行 install.command"
        echo ""
        read -p "按回车键退出..."
        exit 1
    fi
    echo ""
    echo "[OK] 依赖安装成功"
    echo ""
fi

echo "正在启动 TorrentHub..."
echo ""
echo "URL: http://127.0.0.1:7878"
echo "按 Ctrl+C 停止"
echo ""

"$NODE_EXE" server/bin/torrenthub.js --no-browser
`;

const INSTALL_COMMAND = `#!/bin/bash
# TorrentHub macOS 依赖安装脚本
cd "$(dirname "$0")"

echo ""
echo "================================"
echo "  TorrentHub - 依赖安装"
echo "================================"
echo ""

# 检测 Node.js
NODE_EXE=""
if [ -f "runtime/bin/node" ]; then
    NODE_EXE="runtime/bin/node"
    NPM_CMD="runtime/bin/npm"
else
    if command -v node &> /dev/null; then
        NODE_EXE="node"
        NPM_CMD="npm"
    fi
fi

if [ -z "$NODE_EXE" ]; then
    echo "[ERROR] 未找到 Node.js"
    echo "请通过 brew install node 安装，或从 https://nodejs.org 下载"
    read -p "按回车键退出..."
    exit 1
fi

echo "正在安装生产依赖..."
echo ""
"$NODE_EXE" "$NPM_CMD" install --production --no-audit --no-fund
if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] 安装失败"
    read -p "按回车键退出..."
    exit 1
fi

echo ""
echo "[OK] 依赖安装完成，现在可以双击 torrenthub.command 启动"
echo ""
read -p "按回车键退出..."
`;

const LAUNCHD_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.torrenthub</string>

    <key>ProgramArguments</key>
    <array>
        <string>/Users/USER/TorrentHub/runtime/bin/node</string>
        <string>/Users/USER/TorrentHub/server/bin/torrenthub.js</string>
        <string>--no-browser</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/USER/TorrentHub</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>/Users/USER</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>ThrottleInterval</key>
    <integer>10</integer>

    <key>ProcessType</key>
    <string>Background</string>

    <key>StandardOutPath</key>
    <string>/Users/USER/Library/Logs/torrenthub.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/USER/Library/Logs/torrenthub.err.log</string>
</dict>
</plist>
`;

const MACOS_README = `# TorrentHub - macOS 自包含安装包

## 特性

- **无需安装 Node.js**：内置 Node.js 20.x macOS 运行时
- **双击启动**：双击 \`torrenthub.command\` 即可运行
- **自动安装依赖**：首次运行自动安装所需依赖包
- **绿色便携**：解压即用，不污染系统环境

## 系统要求

| 项 | 要求 |
|---|---|
| 操作系统 | macOS 12 Monterey 及以上 |
| 架构 | ${ARCH === 'arm64' ? 'Apple Silicon (M1/M2/M3/M4)' : 'Intel (x86_64)'} |
| 内存 | ≥ 256 MB 可用内存 |
| 磁盘空间 | ≥ 200 MB（含依赖安装后） |
| 端口 | 默认 7878（可自定义） |
| 网络 | 首次运行需要联网安装依赖 |

## 快速开始

### 1. 解压

\`\`\`bash
tar -xzf TorrentHub-macos-${ARCH}.tar.gz -C ~/Applications
\`\`\`

或用 Finder 双击 .tar.gz 解压。

### 2. 启动服务

**双击 \`torrenthub.command\`**

首次运行会自动安装依赖包（需要联网，约 1-2 分钟），完成后自动启动服务。

> 如果提示"无法打开，因为无法验证开发者"：
> 1. 右键点击 \`torrenthub.command\` → 选择"打开"
> 2. 在弹窗中点击"打开"
> 或在终端执行：\`xattr -cr ~/Applications/TorrentHub-macos-${ARCH}/\`

### 3. 访问 Web 界面

启动后在浏览器访问：**http://127.0.0.1:7878**

## 文件结构

\`\`\`
TorrentHub-macos-${ARCH}/
├── runtime/              内置 Node.js 运行时（勿删除）
│   └── bin/
│       ├── node          Node.js 运行时
│       ├── npm           npm 工具
│       └── npx           npx 工具
├── server/               后端代码
│   ├── bin/              后端入口
│   ├── api/              API 路由与逻辑
│   └── shared/           共享类型
├── assets/               前端静态资源
├── index.html            前端入口
├── node_modules/         依赖包（首次运行自动生成）
├── package.json          依赖声明
├── torrenthub.command    主启动脚本（双击运行）
├── install.command       手动安装依赖
├── com.torrenthub.plist  开机自启模板（launchd）
└── README.md             本文件
\`\`\`

## 常用操作

| 操作 | 方法 |
|---|---|
| 启动服务 | 双击 \`torrenthub.command\` |
| 手动安装依赖 | 双击 \`install.command\` |
| 指定端口 | 编辑 \`torrenthub.command\`，在命令后加 \`--port 9000\` |
| 监听所有地址 | 在命令后加 \`--host 0.0.0.0\` |
| 停止服务 | 在终端窗口按 \`Ctrl+C\` |
| 后台运行 | \`nohup ./torrenthub.command > /tmp/torrenthub.log 2>&1 &\` |

## 数据目录

配置和数据库存储在：

\`\`\`
~/.torrenthub/config.json
\`\`\`

## 开机自启（launchd）

1. 复制 \`com.torrenthub.plist\` 到 \`~/Library/LaunchAgents/\`
2. 编辑 plist，将所有 \`/Users/USER/TorrentHub\` 替换为实际路径
3. 加载服务：

\`\`\`bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.torrenthub.plist
launchctl enable gui/$(id -u)/com.torrenthub
\`\`\`

查看状态：

\`\`\`bash
launchctl print gui/$(id -u)/com.torrenthub | grep -E "state|pid"
\`\`\`

停止服务：

\`\`\`bash
launchctl bootout gui/$(id -u)/ ~/Library/LaunchAgents/com.torrenthub.plist
\`\`\`

## 故障排除

| 问题 | 解决方案 |
|---|---|
| 首次启动慢 | 正在安装依赖，请等待 1-2 分钟 |
| 依赖安装失败 | 检查网络；或手动运行 \`install.command\` |
| 无法打开 .command | 右键 → 打开；或 \`xattr -cr\` 清除隔离属性 |
| 端口被占用 | 编辑 \`torrenthub.command\` 加 \`--port 9000\` |
| 权限不足 | 终端执行 \`chmod +x torrenthub.command\` |

## 卸载

直接删除整个 TorrentHub 目录即可。如需清理数据，删除 \`~/.torrenthub\`。
`;

// ============================================================
// 主流程
// ============================================================

try {
  ensureNodeRuntime();
  syncPackage();
  tarPackage();
  console.log('');
  console.log('================================');
  console.log('打包完成！');
  console.log('================================');
  console.log('');
  console.log('macOS 安装步骤:');
  console.log(`  1. 将 dist/${TAR_NAME} 复制到目标机器`);
  console.log('  2. 解压: tar -xzf ' + TAR_NAME);
  console.log('  3. 双击 torrenthub.command（首次运行自动安装依赖）');
  console.log('  4. 在浏览器访问 http://127.0.0.1:7878');
  console.log('');
  console.log(`架构: macOS ${ARCH} (${ARCH_LABEL})`);
  console.log('无需单独安装 Node.js，运行时已内置。');
} catch (err) {
  console.error('打包失败:', err);
  process.exit(1);
}
