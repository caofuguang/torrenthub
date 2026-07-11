// 顶部状态栏
import { useEffect, useState, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, HardDrive, Activity as ActivityIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { formatSpeed, formatBytes } from '@/lib/format';

// 隔离时钟组件，避免每秒触发 Topbar 重渲染
const Clock = memo(function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="ml-auto font-mono text-xs text-ink-500 tabular-nums">
      {now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })}
    </div>
  );
});

export function Topbar() {
  // 复用 Dashboard 的 queryKey，使 React Query 自动去重，避免重复请求
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    structuralSharing: false,
  });

  const stats = data?.stats;
  const dl = stats?.totalDownloadSpeed || 0;
  const ul = stats?.totalUploadSpeed || 0;
  const total = stats?.totalTorrents || 0;
  const active = stats?.activeTorrents || 0;

  return (
    <header className="sticky top-0 z-30 h-14 bg-gradient-to-r from-ink-950 via-ink-900 to-ink-950 border-b border-ink-800/60 flex items-center px-6 gap-6">
      <div className="flex items-center gap-2">
        <ActivityIcon className="w-4 h-4 text-neon" strokeWidth={1.5} />
        <span className="text-sm font-medium text-ink-200">实时状态</span>
      </div>

      <div className="flex items-center gap-5 ml-auto">
        <Stat icon={<ArrowDown className="w-3.5 h-3.5 text-neon" />} label="下载" value={formatSpeed(dl)} valueClass="text-neon glow-neon" />
        <Stat icon={<ArrowUp className="w-3.5 h-3.5 text-trans" />} label="上传" value={formatSpeed(ul)} valueClass="text-trans glow-trans" />
        <Stat icon={<HardDrive className="w-3.5 h-3.5 text-ink-400" />} label="种子" value={`${active}/${total}`} />
      </div>

      <Clock />
    </header>
  );
}

const Stat = memo(function Stat({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-xs text-ink-500">{label}</span>
      <span className={`stat-num text-sm ${valueClass || 'text-ink-200'}`}>{value}</span>
    </div>
  );
});
