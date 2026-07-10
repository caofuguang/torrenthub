// 总览驾驶舱 - 跨客户端聚合统计、健康状态环、实时活动流
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, FileDown, Activity, Server, Cpu, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatSpeed, formatBytes, formatPercent, timeAgo } from '@/lib/format';
import { ClientStatusBadge, ClientTypeBadge } from '@/components/ui/Badges';
import { Empty } from '@/components/ui/Empty';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import type { ClientHealth } from '@shared/types';

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  if (isLoading) {
    return <div className="grid gap-4 animate-pulse">{[...Array(4)].map((_, i) => <div key={i} className="h-28 card" />)}</div>;
  }

  const stats = data?.stats;
  const activities = data?.activities || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">总览驾驶舱</h1>
        <p className="text-sm text-ink-500 mt-1">跨客户端聚合监控 · 实时刷新</p>
      </div>

      {/* 聚合统计卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<FileDown className="w-4 h-4" />}
          label="种子总数"
          value={String(stats?.totalTorrents || 0)}
          sub={`活跃 ${stats?.activeTorrents || 0}`}
          accent="neon"
        />
        <StatCard
          icon={<ArrowDown className="w-4 h-4" />}
          label="总下载速率"
          value={formatSpeed(stats?.totalDownloadSpeed || 0)}
          accent="neon"
        />
        <StatCard
          icon={<ArrowUp className="w-4 h-4" />}
          label="总上传速率"
          value={formatSpeed(stats?.totalUploadSpeed || 0)}
          accent="trans"
        />
        <StatCard
          icon={<Cpu className="w-4 h-4" />}
          label="可用空间"
          value={formatBytes(stats?.totalDiskFree || 0)}
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 客户端健康状态 */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-medium text-ink-100 flex items-center gap-2">
              <Server className="w-4 h-4 text-neon" strokeWidth={1.5} />
              客户端健康
            </h2>
            <Link to="/clients" className="text-xs text-neon hover:underline">管理 →</Link>
          </div>
          {stats?.clients.length === 0 ? (
            <Empty title="尚未添加客户端" description="前往客户端管理添加 qBittorrent 或 Transmission 实例" action={<Link to="/clients" className="btn-primary">添加客户端</Link>} />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {stats?.clients.map((c) => (
                <ClientHealthCard key={c.id} client={c} />
              ))}
            </div>
          )}
        </div>

        {/* 实时活动流 */}
        <div className="card p-5 flex flex-col" style={{ maxHeight: 480 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-medium text-ink-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-neon" strokeWidth={1.5} />
              活动流
            </h2>
            <span className="badge bg-ink-800 text-ink-400">{activities.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {activities.length === 0 ? (
              <Empty title="暂无活动" />
            ) : (
              activities.map((ev) => (
                <div key={ev.id} className="flex gap-3 text-sm group">
                  <div className="flex flex-col items-center pt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-neon/60" />
                    <span className="w-px flex-1 bg-ink-700 mt-1" />
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink-400">{ev.clientName || '系统'}</span>
                      <span className="text-xs text-ink-500">{timeAgo(ev.createdAt)}</span>
                    </div>
                    <p className="text-ink-300 text-xs mt-0.5">{eventLabel(ev.eventType)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent: 'neon' | 'trans' | 'amber' }) {
  const accentMap = { neon: 'text-neon border-neon/20', trans: 'text-trans border-trans/20', amber: 'text-amber border-amber/20' };
  return (
    <div className={cn('card p-4 card-hover', accentMap[accent])}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-400">{label}</span>
        <span className={accentMap[accent].split(' ')[0]}>{icon}</span>
      </div>
      <div className="mt-2 stat-num text-2xl text-ink-100">{value}</div>
      {sub && <div className="text-xs text-ink-500 mt-1">{sub}</div>}
    </div>
  );
}

function ClientHealthCard({ client }: { client: ClientHealth }) {
  const score = client.healthScore;
  const color = score >= 70 ? '#00E676' : score >= 40 ? '#FFB300' : '#FF3D00';
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (score / 100) * circumference;

  return (
    <Link to="/clients" className="card p-4 card-hover group">
      <div className="flex items-center gap-3">
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="#2A3138" strokeWidth="4" />
            <circle
              cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="4"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="stat-num text-sm" style={{ color }}>{score}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-ink-100 truncate">{client.name}</span>
          </div>
          <div className="mt-1"><ClientTypeBadge type={client.type} /></div>
          <div className="mt-1.5 flex items-center gap-2 text-xs">
            <ClientStatusBadge status={client.status} />
            <span className="text-ink-500">{client.torrentCount} 种</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-neon stat-num">{formatSpeed(client.downloadSpeed)}</span>
        <span className="text-trans stat-num">{formatSpeed(client.uploadSpeed)}</span>
      </div>
    </Link>
  );
}

function eventLabel(type: string): string {
  const map: Record<string, string> = {
    client_added: '客户端已添加',
    client_removed: '客户端已移除',
    torrent_added: '种子已添加',
    torrent_deleted: '种子已删除',
    torrent_paused: '种子已暂停',
    torrent_resumed: '种子已恢复',
    tracker_updated: 'Tracker 已更新',
    alert: '触发告警',
  };
  return map[type] || type;
}
