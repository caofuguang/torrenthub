@echo off
chcp 65001 >nul
echo.
echo ================================
echo   TorrentHub - 多客户端种子统一管理
echo ================================
echo.

:: 检查 Node.js 是否已安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    echo https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo 正在启动 TorrentHub 服务...
echo.

:: 启动服务（--no-browser 默认不自动开浏览器，避免 Windows 体验差）
node bin/torrenthub.js --no-browser

pause