import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  Code2, ChevronDown, ChevronRight, Play, Copy, Check,
  ExternalLink, BookOpen, Terminal, AlertCircle, Info,
} from 'lucide-react';
import { api } from '@/lib/api';

// ============================================================
// API 文档结构
// ============================================================

interface ApiEndpoint {
  id: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  params?: { name: string; type: string; required: boolean; description: string; example?: string }[];
  example?: string;
  category: string;
  notes?: string;
}

const apiDocs: ApiEndpoint[] = [
  // ============================================================
  // 1. 健康检查 / 基础
  // ============================================================
  {
    id: 'api-health',
    method: 'GET',
    path: '/api/health',
    summary: '健康检查',
    description: '检查服务是否正常运行，返回当前服务版本号。适合被负载均衡器或监控工具调用。',
    category: '基础接口',
    notes: '此接口不鉴权，适合做服务存活探测。',
  },

  // ============================================================
  // 2. 仪表盘
  // ============================================================
  {
    id: 'api-dashboard',
    method: 'GET',
    path: '/api/dashboard',
    summary: '仪表盘统计数据',
    description: '获取聚合仪表盘数据，包括所有客户端的种子总数、活跃种子数、总下载/上传速度、磁盘空间，以及最近 20 条活动记录。',
    category: '基础接口',
  },

  // ============================================================
  // 3. 客户端管理
  // ============================================================
  {
    id: 'api-clients-list',
    method: 'GET',
    path: '/api/clients',
    summary: '客户端列表',
    description: '获取所有已配置的客户端列表。返回客户端 ID、名称、类型、连接 URL、状态（online/offline）和版本号等信息。',
    category: '客户端管理',
  },
  {
    id: 'api-clients-get',
    method: 'GET',
    path: '/api/clients/:id',
    summary: '获取单个客户端',
    description: '根据客户端 ID 获取单个客户端的详细信息。',
    params: [
      { name: 'id', type: 'string', required: true, description: '客户端唯一标识', example: '"abc123"' },
    ],
    category: '客户端管理',
  },
  {
    id: 'api-clients-test',
    method: 'POST',
    path: '/api/clients/test',
    summary: '测试连接',
    description: '在不保存客户端配置的情况下，测试指定连接参数的连通性。返回连接是否成功以及客户端的版本号。',
    params: [
      { name: 'type', type: 'string', required: true, description: '客户端类型: qbittorrent / transmission', example: '"qbittorrent"' },
      { name: 'url', type: 'string', required: true, description: '客户端 Web UI 地址', example: '"http://192.168.1.100:8080"' },
      { name: 'username', type: 'string', required: false, description: '用户名', example: '"admin"' },
      { name: 'password', type: 'string', required: false, description: '密码', example: '"adminadmin"' },
    ],
    example: `{
  "type": "qbittorrent",
  "url": "http://192.168.1.100:8080",
  "username": "admin",
  "password": "adminadmin"
}`,
    category: '客户端管理',
  },
  {
    id: 'api-clients-create',
    method: 'POST',
    path: '/api/clients',
    summary: '添加客户端',
    description: '新增一个 BT 客户端配置。添加成功后，服务会立即尝试连接该客户端。',
    params: [
      { name: 'name', type: 'string', required: true, description: '客户端显示名称', example: '"客厅 qBittorrent"' },
      { name: 'type', type: 'string', required: true, description: '客户端类型: qbittorrent / transmission', example: '"qbittorrent"' },
      { name: 'url', type: 'string', required: true, description: '客户端 Web UI 完整地址', example: '"http://192.168.1.100:8080"' },
      { name: 'username', type: 'string', required: false, description: '用户名（可选）', example: '"admin"' },
      { name: 'password', type: 'string', required: false, description: '密码（可选）', example: '"adminadmin"' },
    ],
    example: `{
  "name": "客厅 qBittorrent",
  "type": "qbittorrent",
  "url": "http://192.168.1.100:8080",
  "username": "admin",
  "password": "adminadmin"
}`,
    category: '客户端管理',
  },
  {
    id: 'api-clients-update',
    method: 'PUT',
    path: '/api/clients/:id',
    summary: '更新客户端',
    description: '修改客户端配置。更新后会自动重新连接。支持修改名称、URL、认证信息等。',
    params: [
      { name: 'name', type: 'string', required: false, description: '新的显示名称' },
      { name: 'url', type: 'string', required: false, description: '新的 Web UI 地址' },
      { name: 'username', type: 'string', required: false, description: '新的用户名' },
      { name: 'password', type: 'string', required: false, description: '新的密码' },
    ],
    category: '客户端管理',
  },
  {
    id: 'api-clients-delete',
    method: 'DELETE',
    path: '/api/clients/:id',
    summary: '删除客户端',
    description: '删除指定客户端及其所有本地缓存数据。此操作不可恢复。',
    params: [
      { name: 'id', type: 'string', required: true, description: '客户端唯一标识' },
    ],
    category: '客户端管理',
  },
  {
    id: 'api-clients-version',
    method: 'GET',
    path: '/api/clients/:id/version',
    summary: '获取客户端版本',
    description: '调用客户端 getVersion() 接口，返回当前客户端的应用版本号。',
    params: [
      { name: 'id', type: 'string', required: true, description: '客户端唯一标识' },
    ],
    category: '客户端管理',
  },
  {
    id: 'api-clients-reconnect',
    method: 'POST',
    path: '/api/clients/:id/reconnect',
    summary: '重新连接客户端',
    description: '强制断开并重新连接指定客户端。适用于客户端重启后连接失效的场景。',
    params: [
      { name: 'id', type: 'string', required: true, description: '客户端唯一标识' },
    ],
    category: '客户端管理',
  },

  // ============================================================
  // 4. 种子管理
  // ============================================================
  {
    id: 'api-torrents-list',
    method: 'GET',
    path: '/api/torrents',
    summary: '跨客户端种子列表',
    description: '聚合所有在线客户端的种子列表。支持按 clientId、status（downloading/seeding/completed/stalled/paused）和 search（名称关键字）过滤。结果按添加时间倒序排列。',
    params: [
      { name: 'clientId', type: 'string', required: false, description: '仅查询指定客户端', example: '"abc123"' },
      { name: 'status', type: 'string', required: false, description: '仅查询指定状态', example: '"downloading"' },
      { name: 'search', type: 'string', required: false, description: '按名称关键字搜索', example: '"Movie"' },
    ],
    category: '种子管理',
    notes: 'query 参数通过 URL 传递，例如：`/api/torrents?status=seeding&search=movie`。',
  },
  {
    id: 'api-torrents-detail',
    method: 'GET',
    path: '/api/torrents/:clientId/:hash',
    summary: '单个种子详情',
    description: '获取指定客户端中某个种子的详细信息，包括文件列表、下载/上传速度、状态等。',
    params: [
      { name: 'clientId', type: 'string', required: true, description: '客户端唯一标识' },
      { name: 'hash', type: 'string', required: true, description: '种子哈希值', example: '"a1b2c3d4e5..."' },
    ],
    category: '种子管理',
  },
  {
    id: 'api-torrents-add',
    method: 'POST',
    path: '/api/torrents',
    summary: '添加种子（多客户端分发）',
    description: '添加一个磁链或种子 URL，可同时分发到多个客户端。返回每个客户端的操作结果（200 表示全部成功，207 表示部分成功）。',
    params: [
      { name: 'source', type: 'string', required: true, description: '来源: magnet 链接 / .torrent 文件 URL / http 链接', example: '"magnet:?xt=urn:btih:abc123..."' },
      { name: 'clientIds', type: 'string[]', required: true, description: '目标客户端 ID 数组', example: '["client_id_1", "client_id_2"]' },
      { name: 'paused', type: 'boolean', required: false, description: '是否添加后暂停', example: 'false' },
      { name: 'savePath', type: 'string', required: false, description: '保存路径', example: '"/downloads"' },
      { name: 'category', type: 'string', required: false, description: '分类', example: '"movies"' },
      { name: 'tags', type: 'string[]', required: false, description: '标签数组', example: '["4k", "bluray"]' },
      { name: 'limit', type: 'object', required: false, description: '限速配置', example: '{"download": 10485760, "upload": 5242880}' },
    ],
    example: `{
  "source": "magnet:?xt=urn:btih:abc123...",
  "clientIds": ["client_id_1", "client_id_2"],
  "paused": false,
  "savePath": "/downloads",
  "category": "movies",
  "tags": ["4k", "bluray"]
}`,
    category: '种子管理',
    notes: '返回 `success: false` 但 `data` 包含每个客户端的 `BatchResult` 数组，可逐条查看哪些成功、哪些失败。',
  },
  {
    id: 'api-torrents-delete',
    method: 'DELETE',
    path: '/api/torrents',
    summary: '批量删除种子',
    description: '批量删除多个客户端中的种子。支持同时删除种子和关联的磁盘文件。',
    params: [
      { name: 'keys', type: 'object[]', required: true, description: '待删除的种子列表 [{ clientId, hash }]', example: '[{"clientId":"x","hash":"a1b2c3"}]' },
      { name: 'deleteFiles', type: 'boolean', required: false, description: '是否同时删除磁盘上的文件', example: 'false' },
    ],
    example: `{
  "keys": [
    {"clientId": "client_1", "hash": "a1b2c3d4e5"},
    {"clientId": "client_2", "hash": "f6g7h8i9j0"}
  ],
  "deleteFiles": false
}`,
    category: '种子管理',
  },
  {
    id: 'api-torrents-pause-resume',
    method: 'PATCH',
    path: '/api/torrents/state',
    summary: '批量暂停 / 恢复种子',
    description: '批量暂停或恢复多个客户端中的种子。',
    params: [
      { name: 'keys', type: 'object[]', required: true, description: '待操作种子列表 [{ clientId, hash }]', example: '[{"clientId":"x","hash":"a1b2c3"}]' },
      { name: 'action', type: 'string', required: true, description: '操作类型: pause / resume', example: '"pause"' },
    ],
    example: `{
  "keys": [
    {"clientId": "client_1", "hash": "a1b2c3d4e5"},
    {"clientId": "client_2", "hash": "f6g7h8i9j0"}
  ],
  "action": "pause"
}`,
    category: '种子管理',
  },
  {
    id: 'api-torrents-file-priority',
    method: 'POST',
    path: '/api/torrents/:clientId/:hash/files/priority',
    summary: '设置文件优先级',
    description: '为种子内的特定文件设置下载优先级。不同客户端支持不同的优先级级别（0=不要, 1=低, 4=正常, 7=高）。',
    params: [
      { name: 'clientId', type: 'string', required: true, description: '客户端唯一标识' },
      { name: 'hash', type: 'string', required: true, description: '种子哈希值' },
      { name: 'fileIndices', type: 'number[]', required: true, description: '文件索引数组（从 0 开始）', example: '[0, 1, 2]' },
      { name: 'priority', type: 'number', required: true, description: '优先级值', example: '7' },
    ],
    example: `{
  "fileIndices": [0, 1, 2],
  "priority": 7
}`,
    category: '种子管理',
  },

  // ============================================================
  // 5. Tracker 管理
  // ============================================================
  {
    id: 'api-trackers-stats',
    method: 'GET',
    path: '/api/trackers',
    summary: 'Tracker 聚合统计',
    description: '跨所有客户端统计每个 Tracker URL 对应的种子数量。返回 URL、种子数、客户端数。',
    category: 'Tracker 管理',
  },
  {
    id: 'api-trackers-batch',
    method: 'POST',
    path: '/api/trackers/batch',
    summary: '批量 Tracker 操作',
    description: '批量增、删、替换 Tracker。支持正则替换和预览模式（previewOnly=true 时只返回影响范围，不实际修改）。',
    params: [
      { name: 'action', type: 'string', required: true, description: 'add | remove | replace', example: '"replace"' },
      { name: 'torrents', type: 'object[]', required: true, description: '目标种子列表 [{ clientId, hash }]', example: '[{"clientId":"x","hash":"abc"}]' },
      { name: 'urls', type: 'string[]', required: false, description: 'Tracker URL 数组（add/remove 时使用）' },
      { name: 'replace', type: 'object', required: false, description: '替换规则 {from: string, to: string}（replace 时使用），支持正则', example: '{"from":"tracker.example.com","to":"tracker2.example.com"}' },
      { name: 'previewOnly', type: 'boolean', required: false, description: '仅预览不执行', example: 'true' },
    ],
    example: `{
  "action": "replace",
  "torrents": [
    {"clientId": "client_1", "hash": "a1b2c3d4e5"}
  ],
  "replace": {
    "from": "tracker.example.com",
    "to": "tracker2.example.com"
  },
  "previewOnly": false
}`,
    category: 'Tracker 管理',
  },
  {
    id: 'api-torrents-tracker-add',
    method: 'POST',
    path: '/api/torrents/:clientId/:hash/trackers',
    summary: '为单个种子添加 Tracker',
    description: '向指定种子添加 Tracker URL。',
    params: [
      { name: 'clientId', type: 'string', required: true, description: '客户端唯一标识' },
      { name: 'hash', type: 'string', required: true, description: '种子哈希值' },
      { name: 'urls', type: 'string[]', required: true, description: 'Tracker URL 数组', example: '["udp://tracker.example.com:1337"]' },
    ],
    example: `{
  "urls": ["udp://tracker.example.com:1337"]
}`,
    category: 'Tracker 管理',
  },
  {
    id: 'api-torrents-tracker-replace',
    method: 'PUT',
    path: '/api/torrents/:clientId/:hash/trackers',
    summary: '替换单个种子的 Tracker',
    description: '将指定种子的 Tracker URL 按规则替换（支持正则）。',
    params: [
      { name: 'clientId', type: 'string', required: true, description: '客户端唯一标识' },
      { name: 'hash', type: 'string', required: true, description: '种子哈希值' },
      { name: 'from', type: 'string', required: true, description: '匹配模式（正则）', example: '"tracker.example.com"' },
      { name: 'to', type: 'string', required: true, description: '替换为', example: '"tracker2.example.com"' },
    ],
    example: `{
  "from": "tracker.example.com",
  "to": "tracker2.example.com"
}`,
    category: 'Tracker 管理',
  },
  {
    id: 'api-torrents-tracker-remove',
    method: 'DELETE',
    path: '/api/torrents/:clientId/:hash/trackers',
    summary: '从单个种子移除 Tracker',
    description: '从指定种子中移除指定的 Tracker URL。',
    params: [
      { name: 'clientId', type: 'string', required: true, description: '客户端唯一标识' },
      { name: 'hash', type: 'string', required: true, description: '种子哈希值' },
      { name: 'urls', type: 'string[]', required: true, description: '待移除的 Tracker URL 数组', example: '["udp://tracker.example.com:1337"]' },
    ],
    example: `{
  "urls": ["udp://tracker.example.com:1337"]
}`,
    category: 'Tracker 管理',
  },

  // ============================================================
  // 6. 故障监测
  // ============================================================
  {
    id: 'api-monitor-alerts',
    method: 'GET',
    path: '/api/monitor/alerts',
    summary: '告警列表',
    description: '获取所有告警记录，按时间倒序排列。每条告警包含客户端信息、类型、状态（open/acknowledged/resolved）、创建时间等。',
    category: '故障监测',
  },
  {
    id: 'api-monitor-alert-update',
    method: 'PATCH',
    path: '/api/monitor/alerts/:id',
    summary: '更新告警状态',
    description: '流转告警状态: open → acknowledged（已确认）→ resolved（已解决）。',
    params: [
      { name: 'id', type: 'string', required: true, description: '告警 ID' },
      { name: 'status', type: 'string', required: true, description: '新状态: open / acknowledged / resolved', example: '"acknowledged"' },
    ],
    example: `{
  "status": "acknowledged"
}`,
    category: '故障监测',
  },
  {
    id: 'api-monitor-rules',
    method: 'GET',
    path: '/api/monitor/rules',
    summary: '监测规则列表',
    description: '获取所有监测规则配置，包括规则名称、参数、开关状态等。',
    category: '故障监测',
  },
  {
    id: 'api-monitor-rules-update',
    method: 'PUT',
    path: '/api/monitor/rules',
    summary: '批量更新规则',
    description: '批量修改监测规则配置，支持开关和修改参数。',
    params: [
      { name: 'rules', type: 'object[]', required: true, description: '规则数组 [{ id, enabled?, config?, name? }]', example: '[{"id":"dead-seed","enabled":true}]' },
    ],
    example: `[
  { "id": "dead-seed", "enabled": true, "config": { "stalledTimeoutSec": 3600 } },
  { "id": "client-offline", "enabled": false }
]`,
    category: '故障监测',
  },

  // ============================================================
  // 7. 设置 / 数据管理
  // ============================================================
  {
    id: 'api-settings-get',
    method: 'GET',
    path: '/api/settings',
    summary: '获取全局设置',
    description: '返回当前的全局配置，包括端口、监听地址、健康检查间隔等。',
    category: '设置管理',
  },
  {
    id: 'api-settings-update',
    method: 'PUT',
    path: '/api/settings',
    summary: '更新全局设置',
    description: '更新全局配置，修改后立即生效。',
    category: '设置管理',
  },
  {
    id: 'api-settings-export',
    method: 'GET',
    path: '/api/settings/export',
    summary: '导出数据',
    description: '下载完整备份 JSON，包含所有客户端配置、监测规则、告警记录、全局设置。用于数据迁移或备份。',
    category: '设置管理',
    notes: '返回 `Content-Type: application/json` 的完整数据对象，浏览器可直接下载为文件。',
  },
  {
    id: 'api-settings-import',
    method: 'POST',
    path: '/api/settings/import',
    summary: '导入数据',
    description: '上传之前导出的备份文件，支持合并（默认）或完全覆盖。',
    params: [
      { name: 'data', type: 'object', required: true, description: '导出的 data 对象（通过 URL 访问时为空字符串）' },
      { name: 'overwrite', type: 'boolean', required: false, description: '是否覆盖现有数据（默认合并）', example: 'false' },
    ],
    example: `{
  "data": { ... },
  "overwrite": false
}`,
    category: '设置管理',
    notes: '通过 Web UI 上传时以 `multipart/form-data` 的 `file` 字段发送。',
  },
  {
    id: 'api-settings-data-path',
    method: 'GET',
    path: '/api/settings/data-path',
    summary: '查看数据路径',
    description: '返回当前数据目录和配置文件路径，便于定位和备份。',
    category: '设置管理',
  },

  // ============================================================
  // 8. 代理透传 API
  // ============================================================
  {
    id: 'qb-proxy',
    method: '*',
    path: '/api/proxy/:clientId/qbittorrent/*',
    summary: 'qBittorrent WebAPI 透传',
    description: '将任意 HTTP 请求完整转发到指定 qBittorrent 客户端的 Web API。支持 qBittorrent 所有原生 API 端点（app/transfer/torrents/log/auth 等），以及 GET/POST/PUT/DELETE 任意方法。',
    params: [
      { name: 'clientId', type: 'string', required: true, description: '客户端唯一标识（必须为 qBittorrent 类型）' },
    ],
    notes: `## 使用方式

将 \`:clientId\` 替换为真实客户端 ID，路径中 \`*\` 部分改为 qBittorrent 原生 API 路径。

### 示例 1: 获取下载状态
\`\`\`
GET /api/proxy/client_id/qbittorrent/api/v2/transfer/info
GET /api/proxy/client_id/qbittorrent/api/v2/torrents/properties?hash=abc123
POST /api/proxy/client_id/qbittorrent/api/v2/torrents/pause?hashes=abc123
\`\`\`

### 示例 2: 获取应用版本
\`\`\`
GET /api/proxy/client_id/qbittorrent/api/v2/app/version
\`\`\`

### 示例 3: 获取活动日志
\`\`\`
GET /api/proxy/client_id/qbittorrent/api/v2/log/main?filter=torrent_added
\`\`\`

> qBittorrent 5.x 的完整 API 文档请参考官方文档：https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)
>
> 注意: 5.2 版本的 API 端点路径已迁移到 \`/api/v2/\` 下。`,
    category: '代理透传',
  },
  {
    id: 'tr-proxy',
    method: '*',
    path: '/api/proxy/:clientId/transmission',
    summary: 'Transmission RPC 透传',
    description: '将 POST 请求完整转发到指定 Transmission 客户端的 RPC 接口。支持 Transmission 所有原生 RPC 方法。',
    params: [
      { name: 'clientId', type: 'string', required: true, description: '客户端唯一标识（必须为 Transmission 类型）' },
      { name: 'method', type: 'string', required: true, description: 'Transmission RPC 方法名', example: '"torrent-get"' },
      { name: 'arguments', type: 'object', required: true, description: 'RPC 参数对象', example: '{"fields":"name,status,download-speed"}' },
    ],
    example: `{
  "method": "torrent-get",
  "arguments": {
    "fields": "name,status,download-speed,upload-speed,eta,sizewhendone"
  }
}`,
    notes: `## 使用方式

所有请求均为 POST，请求体格式固定为 \`{"method": "...", "arguments": {...}}\`。

### 常用 RPC 方法

| 方法 | 说明 |
|---|---|
| \`session-stats\` | 获取会话统计（上传/下载量、运行时间） |
| \`session-get\` | 获取会话配置（下载目录、限速等） |
| \`session-set\` | 修改会话配置 |
| \`torrent-get\` | 获取种子列表（配合 arguments.fields） |
| \`torrent-add\` | 添加种子 |
| \`torrent-remove\` | 删除种子 |
| \`torrent-pause\` | 暂停种子 |
| \`torrent-resume\` | 恢复种子 |
| \`torrent-set\` | 修改种子属性（优先级等） |
| \`torrent-get/arguments\` | 查询特定字段 |

### 示例 1: 获取所有种子
\`\`\`
POST /api/proxy/client_id/transmission
{
  "method": "torrent-get",
  "arguments": {
    "fields": "id,name,status,download-speed,upload-speed,eta,peers-getting-from,peers-connected-to"
  }
}
\`\`\`

### 示例 2: 获取会话统计
\`\`\`
POST /api/proxy/client_id/transmission
{
  "method": "session-stats",
  "arguments": {}
}
\`\`\`

### 示例 3: 添加种子
\`\`\`
POST /api/proxy/client_id/transmission
{
  "method": "torrent-add",
  "arguments": {
    "filename": "magnet:?xt=urn:btih:abc123...",
    "download-dir": "/downloads"
  }
}
\`\`\`

> Transmission RPC 文档: https://github.com/transmission/transmission/wiki/JSON-RPC`,
    category: '代理透传',
  },
];

// ============================================================
// 类型定义
// ============================================================

type Category = typeof apiDocs[number]['category'];

interface CategoryInfo {
  name: string;
  icon: React.ReactNode;
  color: string;
  count: number;
}

// ============================================================
// 组件
// ============================================================

const methodColors: Record<string, string> = {
  GET: 'text-emerald-400',
  POST: 'text-amber-400',
  PATCH: 'text-blue-400',
  PUT: 'text-cyan-400',
  DELETE: 'text-rose-400',
  '*': 'text-purple-400',
};

const methodBgColors: Record<string, string> = {
  GET: 'bg-emerald-500/10 border-emerald-500/30',
  POST: 'bg-amber-500/10 border-amber-500/30',
  PATCH: 'bg-blue-500/10 border-blue-500/30',
  PUT: 'bg-cyan-500/10 border-cyan-500/30',
  DELETE: 'bg-rose-500/10 border-rose-500/30',
  '*': 'bg-purple-500/10 border-purple-500/30',
};

export default function ApiPlayground() {
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: api.listClients,
  });

  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedApi, setSelectedApi] = useState<ApiEndpoint | null>(null);
  const [requestBody, setRequestBody] = useState<string>('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  // 按分类统计
  const categoryCounts = new Map<string, number>();
  for (const api of apiDocs) {
    categoryCounts.set(api.category, (categoryCounts.get(api.category) || 0) + 1);
  }
  const categoryInfos: CategoryInfo[] = [
    { name: '基础接口', icon: <Info className="w-4 h-4" />, color: 'text-sky-400', count: categoryCounts.get('基础接口') || 0 },
    { name: '客户端管理', icon: <Terminal className="w-4 h-4" />, color: 'text-emerald-400', count: categoryCounts.get('客户端管理') || 0 },
    { name: '种子管理', icon: <Copy className="w-4 h-4" />, color: 'text-amber-400', count: categoryCounts.get('种子管理') || 0 },
    { name: 'Tracker 管理', icon: <ExternalLink className="w-4 h-4" />, color: 'text-cyan-400', count: categoryCounts.get('Tracker 管理') || 0 },
    { name: '故障监测', icon: <AlertCircle className="w-4 h-4" />, color: 'text-rose-400', count: categoryCounts.get('故障监测') || 0 },
    { name: '设置管理', icon: <BookOpen className="w-4 h-4" />, color: 'text-purple-400', count: categoryCounts.get('设置管理') || 0 },
    { name: '代理透传', icon: <Code2 className="w-4 h-4" />, color: 'text-neon-400', count: categoryCounts.get('代理透传') || 0 },
  ];

  // 选择 API 时填充示例
  const selectApi = (api: ApiEndpoint) => {
    setSelectedApi(api);
    setResponse(null);
    setError(null);
    if (api.example) {
      setRequestBody(api.example);
    } else if (api.params?.length) {
      const fields: Record<string, unknown> = {};
      for (const p of api.params) {
        if (p.name === 'clientId' || p.name === 'hash' || p.name === 'id') continue;
        if (p.example) {
          try {
            fields[p.name] = JSON.parse(p.example);
          } catch {
            fields[p.name] = p.example;
          }
        } else if (p.type === 'string' && p.required) {
          fields[p.name] = '';
        } else if (p.type === 'boolean') {
          fields[p.name] = false;
        } else if (p.type === 'number') {
          fields[p.name] = 0;
        } else if (p.type === 'string[]') {
          fields[p.name] = [];
        } else if (p.type === 'object[]') {
          fields[p.name] = [];
        }
      }
      if (Object.keys(fields).length > 0) {
        setRequestBody(JSON.stringify(fields, null, 2));
      } else {
        setRequestBody('');
      }
    } else {
      setRequestBody('');
    }
  };

  // 执行请求
  const execute = async () => {
    if (!selectedApi) return;
    setLoading(true);
    setResponse(null);
    setError(null);

    try {
      const resolvedPath = selectedApi.path.replace(':clientId', selectedClient).replace(':hash', '').replace(':id', '');
      const opts: RequestInit = {
        method: selectedApi.method === '*' ? 'GET' : selectedApi.method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (['POST', 'PUT', 'PATCH'].includes(selectedApi.method) || (selectedApi.method === '*' && requestBody.trim())) {
        let body = requestBody.trim();
        if (body) {
          try {
            body = JSON.stringify(JSON.parse(body));
          } catch { /* use raw text */ }
          opts.body = body;
        } else {
          opts.body = undefined;
        }
      }

      const start = performance.now();
      const res = await fetch(resolvedPath, opts);
      const elapsed = Math.round(performance.now() - start);

      let rawText = '';
      try {
        rawText = await res.text();
      } catch {
        rawText = '[无法读取响应体]';
      }

      let displayText: string;
      try {
        const json = JSON.parse(rawText);
        displayText = JSON.stringify(json, null, 2);
      } catch {
        displayText = rawText;
      }

      setResponse(`HTTP ${res.status} ${res.statusText}  (${elapsed}ms)\n\n${displayText}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 复制到剪贴板
  const copyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(response);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 复制 cURL 命令
  const copyCurl = () => {
    if (!selectedApi) return;
    const resolvedPath = selectedApi.path.replace(':clientId', selectedClient || 'client_id');
    const isGet = selectedApi.method === 'GET' || selectedApi.method === '*';
    const curlCmd = isGet
      ? `curl -X ${selectedApi.method === '*' ? 'GET' : selectedApi.method} "${resolvedPath}"`
      : `curl -X ${selectedApi.method} "${resolvedPath}" -H "Content-Type: application/json" -d '${requestBody.replace(/'/g, "'\\''")}'`;
    navigator.clipboard.writeText(curlCmd);
    setCurlCopied(true);
    setTimeout(() => setCurlCopied(false), 2000);
  };

  // 代理路径替换
  function resolveProxyPath(path: string, clientId: string): string {
    return path.replace(':clientId', clientId);
  }

  return (
    <div className="space-y-4">
      {/* 顶部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-100 flex items-center gap-2">
            <Code2 className="w-5 h-5 text-neon" /> API 工作台
          </h1>
          <p className="text-sm text-ink-500 mt-1">浏览所有支持的 API · 查看调用格式 · 直接测试并查看返回结果</p>
        </div>
        {clients.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-500">透传客户端</span>
            <select
              className="input text-sm"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
            >
              <option value="">— 选择客户端 —</option>
              {clients.filter((c) => c.status === 'online').map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 主内容区 */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* 左侧：分类导航 + API 列表 */}
        <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
          {categoryInfos.map((cat) => {
            const endpoints = apiDocs.filter((a) => a.category === cat.name);
            return (
              <div key={cat.name} className="rounded-lg border border-ink-800 overflow-hidden">
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 bg-ink-900 hover:bg-ink-800 transition-colors text-sm font-medium text-ink-200"
                  onClick={() => {}} // 默认全部展开
                >
                  <span className={cat.color}>{cat.icon}</span>
                  <span>{cat.name}</span>
                  <span className="ml-auto text-xs text-ink-500">{cat.count}</span>
                </button>
                <div className="bg-ink-950/50">
                  {endpoints.map((api) => (
                    <button
                      key={api.id}
                      onClick={() => selectApi(api)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors border-b border-ink-800/50 last:border-b-0',
                        selectedApi?.id === api.id ? 'bg-neon/10 text-neon border-l-2 border-l-neon pl-2' : 'text-ink-400 hover:text-ink-200 hover:bg-ink-900',
                      )}
                    >
                      <span className={cn('font-mono font-bold text-[10px] w-8', methodColors[api.method])}>{api.method}</span>
                      <span className="font-mono truncate text-xs">{api.summary}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* 右侧：API 详情 + 测试区 */}
        <div className="rounded-lg border border-ink-800 overflow-hidden flex flex-col min-h-[600px]">
          {selectedApi ? (
            <>
              {/* 顶部：方法 + 路径 */}
              <div className="flex items-center gap-2 px-4 py-3 bg-ink-900 border-b border-ink-800">
                <span className={cn('px-2 py-1 rounded text-xs font-bold font-mono border', methodBgColors[selectedApi.method], methodColors[selectedApi.method])}>
                  {selectedApi.method}
                </span>
                <code className="font-mono text-sm text-ink-100">{selectedApi.path}</code>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={copyCurl}
                    className="p-1.5 rounded hover:bg-ink-800 text-ink-500 hover:text-ink-200 transition-colors"
                    title="复制 cURL 命令"
                  >
                    {curlCopied ? <Check className="w-4 h-4 text-neon" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* 说明区 */}
              <div className="px-4 py-3 bg-ink-950/30 border-b border-ink-800">
                <h2 className="text-sm font-medium text-ink-100">{selectedApi.summary}</h2>
                <p className="text-xs text-ink-400 mt-1">{selectedApi.description}</p>
                {selectedApi.notes && (
                  <div className="mt-2 p-2 bg-neon/5 border border-neon/20 rounded text-xs text-neon whitespace-pre-wrap">
                    <div className="flex items-center gap-1 mb-1 text-neon font-medium">
                      <BookOpen className="w-3 h-3" /> 使用说明
                    </div>
                    {selectedApi.notes.split('\n').map((line, i) => {
                      if (line.startsWith('## ')) {
                        return <div key={i} className="font-medium text-ink-200 mt-1">{line.replace('## ', '')}</div>;
                      }
                      if (line.startsWith('### ')) {
                        return <div key={i} className="font-medium text-ink-300 mt-1">{line.replace('### ', '')}</div>;
                      }
                      if (line.startsWith('- ')) {
                        return <div key={i} className="text-ink-400 ml-2">{line.replace('- ', '')}</div>;
                      }
                      if (line.startsWith('> ')) {
                        return <div key={i} className="text-ink-500 italic mt-1">{line.replace('> ', '')}</div>;
                      }
                      if (line === '```') return null;
                      if (line.startsWith('|')) {
                        return <div key={i} className="text-ink-400 text-xs">{line}</div>;
                      }
                      return <div key={i} className="text-ink-300">{line}</div>;
                    })}
                  </div>
                )}
              </div>

              {/* 参数表 */}
              {selectedApi.params && selectedApi.params.length > 0 && (
                <div className="px-4 py-3 border-b border-ink-800">
                  <h3 className="text-xs font-medium text-ink-400 mb-2 flex items-center gap-1">
                    <Terminal className="w-3 h-3" /> 参数
                  </h3>
                  <div className="grid gap-1">
                    {selectedApi.params.map((p) => (
                      <div key={p.name} className="flex items-start gap-2 text-xs">
                        <code className="font-mono text-neon min-w-[80px]">{p.name}</code>
                        <span className="text-ink-500">{p.type}</span>
                        {p.required && <span className="text-vermilion text-[10px]">*必填</span>}
                        <span className="text-ink-400 flex-1">{p.description}</span>
                        {p.example && <code className="font-mono text-ink-500 text-[10px]">{p.example}</code>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 请求体编辑 */}
              {selectedApi.method !== 'GET' && (
                <div className="border-b border-ink-800">
                  <div className="px-4 py-2 flex items-center justify-between bg-ink-900/50">
                    <span className="text-xs font-medium text-ink-400">请求体 (JSON)</span>
                    <span className="text-[10px] text-ink-600">{requestBody.length} 字符</span>
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    className="w-full h-32 px-4 py-2 bg-ink-950 font-mono text-sm text-ink-200 resize-none focus:outline-none"
                    spellCheck={false}
                    placeholder='{"key": "value"}'
                  />
                </div>
              )}

              {[selectedApi.method === '*', selectedApi.method === 'GET'].filter(Boolean).length > 0 && (
                <div className="border-b border-ink-800">
                  <div className="px-4 py-2 flex items-center justify-between bg-ink-900/50">
                    <span className="text-xs font-medium text-ink-400">请求体 (JSON) — 透传模式下可选</span>
                    <span className="text-[10px] text-ink-600">{requestBody.length} 字符</span>
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    className="w-full h-20 px-4 py-2 bg-ink-950 font-mono text-sm text-ink-200 resize-none focus:outline-none"
                    spellCheck={false}
                    placeholder='GET 请求时留空即可'
                  />
                </div>
              )}

              {/* 执行按钮 + 结果 */}
              <div className="flex-1 flex flex-col">
                <div className="px-4 py-3 flex items-center gap-3 border-b border-ink-800">
                  <button
                    onClick={execute}
                    disabled={loading}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded bg-neon hover:bg-neon/80 text-ink-950 font-medium text-sm transition-colors',
                      loading && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <Play className="w-3 h-3" /> {loading ? '请求中...' : '执行请求'}
                  </button>
                  <button
                    onClick={copyResponse}
                    disabled={!response}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded border border-ink-700 text-ink-300 hover:bg-ink-800 text-sm transition-colors',
                      !response && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {copied ? <Check className="w-3 h-3 text-neon" /> : <Copy className="w-3 h-3" />} 复制结果
                  </button>
                  {selectedClient && (
                    <span className="ml-auto text-xs text-ink-500">
                      客户端: {clients.find((c) => c.id === selectedClient)?.name || selectedClient}
                    </span>
                  )}
                </div>

                <div className="flex-1 p-4 overflow-auto">
                  {error && (
                    <div className="p-3 bg-vermilion/10 border border-vermilion/30 rounded text-vermilion text-xs">
                      <div className="flex items-center gap-1 font-medium mb-1">
                        <AlertCircle className="w-3 h-3" /> 请求失败
                      </div>
                      <p className="font-mono">{error}</p>
                    </div>
                  )}
                  {response && (
                    <div className="bg-ink-950 border border-ink-800 rounded p-3 font-mono text-xs text-ink-200 overflow-auto max-h-[300px] whitespace-pre-wrap">
                      {response}
                    </div>
                  )}
                  {!response && !error && (
                    <div className="flex items-center justify-center h-full text-ink-600 text-sm">
                      <div className="flex flex-col items-center gap-2">
                        <Terminal className="w-8 h-8 opacity-30" />
                        <p>选择 API 后点击"执行请求"查看返回结果</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-ink-500 py-16">
              <BookOpen className="w-12 h-12 opacity-20 mb-4" />
              <p className="text-sm">← 从左侧选择一个 API 开始探索</p>
              <p className="text-xs text-ink-600 mt-1">支持在线测试、参数说明、cURL 复制</p>
            </div>
          )}
        </div>
      </div>

      {/* 底部说明 */}
      <div className="text-xs text-ink-600 border-t border-ink-800 pt-3">
        基础接口无需客户端选择 · 代理透传需选择在线客户端后自动替换路径 · qBittorrent 5.2+ 使用 /api/v2/ 路径
      </div>
    </div>
  );
}