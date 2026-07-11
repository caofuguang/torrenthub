// 状态徽标组件
import { cn } from '@/lib/utils';
import type { ClientStatus, TorrentStatus, ClientType } from '@shared/types';

const clientStatusMap: Record<ClientStatus, { label: string; className: string; dot: string }> = {
  online: { label: '在线', className: 'bg-neon/10 text-neon border-neon/30', dot: 'bg-neon shadow-[0_0_6px_rgba(0,230,118,0.6)]' },
  offline: { label: '离线', className: 'bg-vermilion/10 text-vermilion border-vermilion/30', dot: 'bg-vermilion' },
  degraded: { label: '降级', className: 'bg-amber/10 text-amber border-amber/30', dot: 'bg-amber' },
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const s = clientStatusMap[status];
  return (
    <span className={cn('badge border', s.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

const torrentStatusMap: Record<TorrentStatus, { label: string; className: string }> = {
  downloading: { label: '下载中', className: 'bg-neon/10 text-neon border border-neon/20' },
  seeding: { label: '做种', className: 'bg-trans/10 text-trans border border-trans/20' },
  paused: { label: '已暂停', className: 'bg-ink-600/30 text-ink-300 border border-ink-600/40' },
  queued: { label: '排队', className: 'bg-amber/10 text-amber border border-amber/20' },
  error: { label: '错误', className: 'bg-vermilion/10 text-vermilion border border-vermilion/20' },
  checking: { label: '校验', className: 'bg-qbit/10 text-qbit border border-qbit/20' },
  stalled: { label: '停滞', className: 'bg-ink-500/20 text-ink-400 border border-ink-500/30' },
};

export function TorrentStatusBadge({ status }: { status: TorrentStatus }) {
  const s = torrentStatusMap[status];
  return <span className={cn('badge', s.className)}>{s.label}</span>;
}

export function ClientTypeBadge({ type }: { type: ClientType }) {
  const isQb = type === 'qbittorrent';
  return (
    <span className={cn('badge border', isQb ? 'bg-qbit/10 text-qbit border-qbit/20' : 'bg-trans/10 text-trans border-trans/20')}>
      {isQb ? 'qBittorrent' : 'Transmission'}
    </span>
  );
}

export function AlertLevelBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    info: 'bg-trans/10 text-trans border border-trans/20',
    warning: 'bg-amber/10 text-amber border border-amber/20',
    error: 'bg-vermilion/10 text-vermilion border border-vermilion/20',
    critical: 'bg-vermilion/20 text-vermilion border border-vermilion/40',
  };
  const label: Record<string, string> = { info: '信息', warning: '警告', error: '错误', critical: '严重' };
  return <span className={cn('badge border', map[level] || 'bg-ink-700 text-ink-300 border-ink-600')}>{label[level] || level}</span>;
}
