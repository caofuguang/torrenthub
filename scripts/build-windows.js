/**
 * Windows 自包含打包脚本 - 生成包含 Node.js 运行时的独立分发包
 *
 * 包内容:
 *   - runtime/          内置 Node.js Windows x64 运行时（无需单独安装 Node.js）
 *   - bin/              后端入口
 *   - api/              编译后的后端代码
 *   - shared/           共享类型
 *   - assets/           前端静态资源
 *   - index.html        前端入口
 *   - package.json      生产依赖声明（首次启动自动安装）
 *   - torrenthub.cmd    智能启动器（首次运行自动安装依赖）
 *   - install.cmd       手动依赖安装脚本
 *   - README.md         安装说明
 *
 * 使用方法:
 *   node scripts/build-windows.js
 *
 * 前置条件:
 *   1. 已执行 npm run build (构建前端)
 *   2. 已执行 npm run build:server (编译后端)
 *   3. /tmp/node-win-extract/node-v20.18.1-win-x64/ 存在（Node.js Windows 运行时）
 *
 * 输出:
 *   dist/TorrentHub-win-x64.zip
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'dist', 'win-package');
const ZIP_NAME = 'TorrentHub-win-x64.zip';
const ZIP_PATH = path.join(ROOT, 'dist', ZIP_NAME);

// Node.js Windows 运行时路径（由本脚本自动下载）
const NODE_RUNTIME_SRC = '/tmp/node-win-extract/node-v20.18.1-win-x64';

// ============================================================
// 工具函数
// ============================================================

function mkdirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFileSync(src, dst) {
  mkdirSync(path.dirname(dst));
  fs.copyFileSync(src, dst);
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
// 下载 Node.js Windows 运行时（如果不存在）
// ============================================================

function ensureNodeRuntime() {
  if (fs.existsSync(path.join(NODE_RUNTIME_SRC, 'node.exe'))) {
    console.log('[OK] Node.js Windows 运行时已存在');
    return;
  }
  console.log('正在下载 Node.js Windows x64 运行时...');
  const url = 'https://nodejs.org/dist/v20.18.1/node-v20.18.1-win-x64.zip';
  const zipPath = '/tmp/node-win-x64.zip';
  execSync(`curl -L --max-time 120 -o "${zipPath}" "${url}"`, { stdio: 'inherit' });
  execSync(`rm -rf /tmp/node-win-extract && mkdir -p /tmp/node-win-extract`, { stdio: 'inherit' });
  execSync(`unzip -o "${zipPath}" -d /tmp/node-win-extract`, { stdio: 'inherit' });
  console.log('[OK] Node.js Windows 运行时下载完成');
}

// ============================================================
// 同步打包目录
// ============================================================

function syncPackage() {
  console.log('正在构建 Windows 自包含分发包...');

  // 清理输出目录
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  mkdirSync(OUTPUT_DIR);

  // 1. 复制 Node.js 运行时（仅保留必要文件，减小体积）
  const runtimeDir = path.join(OUTPUT_DIR, 'runtime');
  mkdirSync(runtimeDir);
  // node.exe 是核心运行时
  copyFileSync(path.join(NODE_RUNTIME_SRC, 'node.exe'), path.join(runtimeDir, 'node.exe'));
  // npm 相关文件（用于首次安装依赖）
  copyDirSync(path.join(NODE_RUNTIME_SRC, 'node_modules'), path.join(runtimeDir, 'node_modules'));
  copyFileSync(path.join(NODE_RUNTIME_SRC, 'npm'), path.join(runtimeDir, 'npm'));
  copyFileSync(path.join(NODE_RUNTIME_SRC, 'npm.cmd'), path.join(runtimeDir, 'npm.cmd'));
  copyFileSync(path.join(NODE_RUNTIME_SRC, 'npx'), path.join(runtimeDir, 'npx'));
  copyFileSync(path.join(NODE_RUNTIME_SRC, 'npx.cmd'), path.join(runtimeDir, 'npx.cmd'));
  console.log('[OK] runtime/ (Node.js Windows 运行时)');

  // 2. 复制后端编译产物（dist/server/ -> server/）
  // 保持 server/ 子目录结构，使 app.js 中 path.join(__dirname, '../..') 正确指向包根目录
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
      dotenv: '^17.2.1',
      express: '^4.21.2',
      'lucide-react': '^0.511.0',
      motion: '^10.16.0',
      multer: '^1.4.5-lts.1',
      open: '^10.1.0',
      pino: '^9.5.0',
      'pino-pretty': '^11.2.2',
      'react': '^18.3.1',
      'react-dom': '^18.3.1',
      'react-router-dom': '^7.3.0',
      recharts: '^2.12.7',
      'tailwind-merge': '^3.0.2',
      ws: '^8.18.0',
      zustand: '^5.0.3',
    },
    engines: { node: '>=18' },
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'package.json'), JSON.stringify(prodPackage, null, 2));
  console.log('[OK] package.json (生产依赖声明)');

  // 5. 创建启动脚本
  fs.writeFileSync(path.join(OUTPUT_DIR, 'torrenthub.cmd'), LAUNCHER_CMD);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'install.cmd'), INSTALL_CMD);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'start.vbs'), START_VBS);
  console.log('[OK] torrenthub.cmd install.cmd start.vbs (启动脚本)');

  // 6. 生成 README
  fs.writeFileSync(path.join(OUTPUT_DIR, 'README.md'), WINDOWS_README);
  console.log('[OK] README.md (安装说明)');

  console.log('');
}

// ============================================================
// ZIP 压缩（使用系统 zip 命令，保证兼容性）
// ============================================================

function zipPackage() {
  console.log('正在压缩 ZIP（使用系统 zip）...');

  // 删除旧 ZIP
  if (fs.existsSync(ZIP_PATH)) {
    fs.rmSync(ZIP_PATH);
  }

  // 重命名目录为最终包名
  const finalDir = path.join(path.dirname(OUTPUT_DIR), 'TorrentHub-win-x64');
  if (fs.existsSync(finalDir)) {
    fs.rmSync(finalDir, { recursive: true });
  }
  fs.renameSync(OUTPUT_DIR, finalDir);

  // 使用系统 zip 命令打包（-r 递归，-q 安静模式）
  const parentDir = path.dirname(finalDir);
  const dirName = path.basename(finalDir);
  execSync(`cd "${parentDir}" && zip -r -q "${ZIP_PATH}" "${dirName}"`, { stdio: 'inherit' });

  const size = fs.statSync(ZIP_PATH).size;
  console.log(`[OK] ZIP 已生成: ${ZIP_NAME} (${formatSize(size)})`);

  // 清理临时目录
  fs.rmSync(finalDir, { recursive: true });
  console.log('[OK] 已清理临时文件');
}

// ============================================================
// 启动脚本内容
// ============================================================

const LAUNCHER_CMD = `@echo off
chcp 65001 >nul
title TorrentHub
echo.
echo ================================
echo   TorrentHub - BT Client Manager
echo ================================
echo.

cd /d "%~dp0"

REM Detect Node.js: try bundled runtime first, then system node
set NODE_EXE=
if exist "runtime\\node.exe" (
    set NODE_EXE=runtime\\node.exe
    set NPM_CLI=runtime\\node_modules\\npm\\bin\\npm-cli.js
) else (
    where node >nul 2>&1
    if %errorlevel% equ 0 (
        set NODE_EXE=node
        set NPM_CLI=npm
        echo [INFO] Using system Node.js
    )
)

if "%NODE_EXE%"=="" (
    echo [ERROR] Node.js not found.
    echo.
    echo Reason: runtime\\node.exe is missing, possibly deleted by antivirus.
    echo.
    echo Solution 1: Install Node.js 18+ from https://nodejs.org
    echo Solution 2: Re-extract the ZIP and add an antivirus exclusion for this folder.
    echo.
    pause
    exit /b 1
)

REM Check and install dependencies on first run
set NEED_INSTALL=0
if not exist "node_modules\\open" set NEED_INSTALL=1
if not exist "node_modules\\express" set NEED_INSTALL=1
if "%NEED_INSTALL%"=="1" (
    echo [First Run] Installing dependencies, please wait...
    echo.
    if "%NPM_CLI%"=="npm" (
        npm install --production --no-audit --no-fund
    ) else (
        %NODE_EXE% %NPM_CLI% install --production --no-audit --no-fund
    )
    if errorlevel 1 (
        echo.
        echo [ERROR] Dependency installation failed.
        echo Please check your network connection and retry.
        echo Or run install.cmd manually.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed successfully.
    echo.
)

echo Starting TorrentHub...
echo.
echo URL: http://127.0.0.1:7878
echo Press Ctrl+C to stop.
echo.

%NODE_EXE% server\\bin\\torrenthub.js --no-browser
pause
`;

const INSTALL_CMD = `@echo off
chcp 65001 >nul
title TorrentHub - Install
echo.
echo ================================
echo   TorrentHub Dependency Install
echo ================================
echo.

cd /d "%~dp0"

REM Detect Node.js
set NODE_EXE=
if exist "runtime\\node.exe" (
    set NODE_EXE=runtime\\node.exe
    set NPM_CLI=runtime\\node_modules\\npm\\bin\\npm-cli.js
) else (
    where node >nul 2>&1
    if %errorlevel% equ 0 (
        set NODE_EXE=node
        set NPM_CLI=npm
    )
)

if "%NODE_EXE%"=="" (
    echo [ERROR] Node.js not found.
    echo Install Node.js 18+ from https://nodejs.org or re-extract the ZIP.
    pause
    exit /b 1
)

echo Installing production dependencies...
echo.
if "%NPM_CLI%"=="npm" (
    npm install --production --no-audit --no-fund
) else (
    %NODE_EXE% %NPM_CLI% install --production --no-audit --no-fund
)
if errorlevel 1 (
    echo.
    echo [ERROR] Installation failed.
    pause
    exit /b 1
)

echo.
echo [OK] Dependencies installed. You can now run torrenthub.cmd
echo.
pause
`;

// VBS script for background startup (no console window)
const START_VBS = `' TorrentHub background startup (no console window)
Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
If fso.FileExists("runtime\\node.exe") Then
    WshShell.Run "runtime\\node.exe server\\bin\\torrenthub.js --no-browser", 0, False
Else
    WshShell.Run "node server\\bin\\torrenthub.js --no-browser", 0, False
End If
`;

// ============================================================
// README 内容
// ============================================================

const WINDOWS_README = `# TorrentHub - Windows 自包含安装包

## 特性

- **无需安装 Node.js**：内置 Node.js 20.x Windows 运行时
- **一键启动**：双击 \`torrenthub.cmd\` 即可运行
- **自动安装依赖**：首次运行自动安装所需依赖包
- **绿色便携**：解压即用，不污染系统环境变量

## 系统要求

| 项 | 要求 |
|---|---|
| 操作系统 | Windows 10 64 位及以上 |
| 内存 | ≥ 256 MB 可用内存 |
| 磁盘空间 | ≥ 200 MB（含依赖安装后） |
| 端口 | 默认 7878（可自定义） |
| 网络 | 首次运行需要联网安装依赖 |

## 快速开始

### 1. 解压

将 \`TorrentHub-win-x64.zip\` 解压到任意目录，例如：

\`\`\`
C:\\TorrentHub
D:\\Programs\\TorrentHub
\`\`\`

### 2. 启动服务

**双击 \`torrenthub.cmd\`**

首次运行会自动安装依赖包（需要联网，约 1-2 分钟），完成后自动启动服务。

### 3. 访问 Web 界面

启动后在浏览器访问：**http://127.0.0.1:7878**

## 文件结构

\`\`\`
TorrentHub-win-x64/
├── runtime/              内置 Node.js 运行时（勿删除）
│   ├── node.exe          Node.js 运行时
│   ├── node_modules/     npm 工具
│   └── npm.cmd
├── server/               后端代码
│   ├── bin/              后端入口
│   ├── api/              API 路由与逻辑
│   └── shared/           共享类型
├── assets/               前端静态资源
├── index.html            前端入口
├── node_modules/         依赖包（首次运行自动生成）
├── package.json          依赖声明
├── torrenthub.cmd        主启动脚本
├── install.cmd           手动安装依赖
├── start.vbs             后台启动（无窗口）
└── README.md             本文件
\`\`\`

## 常用操作

| 操作 | 方法 |
|---|---|
| 启动服务 | 双击 \`torrenthub.cmd\` |
| 后台启动 | 双击 \`start.vbs\`（无窗口） |
| 手动安装依赖 | 双击 \`install.cmd\` |
| 指定端口 | 编辑 \`torrenthub.cmd\`，在命令后加 \`--port 9000\` |
| 监听所有地址 | 在命令后加 \`--host 0.0.0.0\` |
| 停止服务 | 在命令行窗口按 \`Ctrl+C\`；后台运行时用任务管理器结束 \`node.exe\` |

## 数据目录

配置和数据库存储在：

\`\`\`
%APPDATA%\\torrenthub\\
\`\`\`

包含文件：
- \`config.json\` — 客户端配置、告警规则
- \`activities.db\` — 活动记录数据库

## 设置开机自启

### 方法 1：启动文件夹（推荐）

1. 按 \`Win+R\`，输入 \`shell:startup\`
2. 在打开的文件夹中创建 \`start.vbs\` 的快捷方式

### 方法 2：任务计划程序

1. 打开"任务计划程序"
2. 创建基本任务，名称填 \`TorrentHub\`
3. 触发器选择"当用户登录时"
4. 操作选择"启动程序"，浏览选择 \`start.vbs\`

## 防火墙配置

如果客户端位于其他机器上，需放行 7878 端口：

\`\`\`cmd
netsh advfirewall firewall add rule name="TorrentHub" dir=in action=allow protocol=TCP localport=7878
\`\`\`

## 故障排除

| 问题 | 解决方案 |
|---|---|
| 首次启动慢 | 正在安装依赖，请等待 1-2 分钟 |
| 依赖安装失败 | 检查网络；或手动运行 \`install.cmd\` |
| 启动后无法访问 | 检查防火墙；尝试 \`--host 0.0.0.0\` |
| 端口被占用 | 编辑 \`torrenthub.cmd\` 加 \`--port 9000\` |
| node.exe 被杀毒软件拦截 | 将目录加入白名单 |
| 后台运行无法停止 | 任务管理器结束 \`node.exe\` 进程 |

## 卸载

直接删除整个 TorrentHub 目录即可。如需清理数据，删除 \`%APPDATA%\\torrenthub\`。
`;

// ============================================================
// 主流程
// ============================================================

try {
  ensureNodeRuntime();
  syncPackage();
  zipPackage();
  console.log('');
  console.log('================================');
  console.log('打包完成！');
  console.log('================================');
  console.log('');
  console.log('Windows 安装步骤:');
  console.log('  1. 将 dist/TorrentHub-win-x64.zip 复制到 Windows 机器');
  console.log('  2. 解压到任意目录');
  console.log('  3. 双击 torrenthub.cmd（首次运行自动安装依赖）');
  console.log('  4. 在浏览器访问 http://127.0.0.1:7878');
  console.log('');
  console.log('无需单独安装 Node.js，运行时已内置。');
} catch (err) {
  console.error('打包失败:', err);
  process.exit(1);
}
