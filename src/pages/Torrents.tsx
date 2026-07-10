// 种子中心 - 跨客户端统一种子列表、批量操作、详情抽屉
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Pause, Play, Trash2, FileDown, ChevronDown, X,
  ArrowDown, ArrowUp, Users, Network, File as FileIcon, Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { TorrentStatusBadge, ClientTypeBadge } from '@/components/ui/Badges';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Empty } from '@/components/ui/Empty';
import { formatBytes, formatSpeed, formatEta, formatRatio, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { UnifiedTorrent, TorrentFile, PeerInfo, TrackerStat } from '@shared/types';

export default function Torrents() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<UnifiedTorrent | null>(null);

  const { data: torrents = [], isLoading } = useQuery({
    queryKey: ['torrents', search, statusFilter],
    queryFn: () => api.listTorrents({ search, status: statusFilter }),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: api.listClients });
  const clientTypeMap = useMemo(() => {
    const m = new Map<string, 'qbittorrent' | 'transmission'>();
    clients.forEach((c) => m.set(c.id, c.type));
    return m;
  }, [clients]);

  const qc = useQueryClient();

  const keys = useMemo(
    () => Array.from(selected).map((s) => { const [clientId, hash] = s.split('::'); return { clientId, hash }; }),
    [selected],
  );

  const pauseMut = useMutation({ mutationFn: () => api.setTorrentState(keys, 'pause'), onSuccess: () => { qc.invalidateQueries({ queryKey: ['torrents'] }); setSelected(new Set()); } });
  const resumeMut = useMutation({ mutationFn: () => api.setTorrentState(keys, 'resume'), onSuccess: () => { qc.invalidateQueries({ queryKey: ['torrents'] }); setSelected(new Set()); } });
  const deleteMut = useMutation({
    mutationFn: (deleteFiles: boolean) => api.deleteTorrents(keys, deleteFiles),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['torrents'] }); setSelected(new Set()); },
  });

  const toggle = (key: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };
  const toggleAll = () => {
    setSelected((prev) => prev.size === torrents.length ? new Set() : new Set(torrents.map((t) => `${t.clientId}::${t.hash}`)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-100">种子中心</h1>
          <p className="text-sm text-ink-500 mt-1">{torrents.length} 个种子 · 跨客户端聚合</p>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
          <input className="input pl-9" placeholder="搜索种子名称..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">全部状态</option>
          <option value="downloading">下载中</option>
          <option value="seeding">做种</option>
          <option value="paused">已暂停</option>
          <option value="error">错误</option>
          <option value="stalled">停滞</option>
        </select>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto animate-fade-up">
            <span className="badge bg-neon/10 text-neon border border-neon/30">已选 {selected.size}</span>
            <button className="btn-ghost text-xs" onClick={() => pauseMut.mutate()} disabled={pauseMut.isPending}><Pause className="w-3.5 h-3.5" /> 暂停</button>
            <button className="btn-ghost text-xs" onClick={() => resumeMut.mutate()} disabled={resumeMut.isPending}><Play className="w-3.5 h-3.5" /> 恢复</button>
            <button className="btn-danger text-xs" onClick={() => { if (confirm(`删除 ${selected.size} 个种子？`)) deleteMut.mutate(false); }} disabled={deleteMut.isPending}><Trash2 className="w-3.5 h-3.5" /> 删除</button>
          </div>
        )}
      </div>

      {/* 表格 */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-ink-500"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : torrents.length === 0 ? (
          <Empty title="暂无种子" description="添加种子或检查客户端连接" icon={<FileDown className="w-12 h-12" strokeWidth={1} />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-800 text-xs text-ink-500">
                  <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={selected.size === torrents.length && torrents.length > 0} onChange={toggleAll} className="accent-neon" /></th>
                  <th className="text-left px-3 py-2.5 font-medium">名称</th>
                  <th className="text-left px-3 py-2.5 font-medium w-24">客户端</th>
                  <th className="text-right px-3 py-2.5 font-medium w-20">大小</th>
                  <th className="text-left px-3 py-2.5 font-medium w-32">进度</th>
                  <th className="text-right px-3 py-2.5 font-medium w-24">↓ 速度</th>
                  <th className="text-right px-3 py-2.5 font-medium w-24">↑ 速度</th>
                  <th className="text-left px-3 py-2.5 font-medium w-20">状态</th>
                  <th className="text-right px-3 py-2.5 font-medium w-16">比率</th>
                </tr>
              </thead>
              <tbody>
                {torrents.map((t) => {
                  const key = `${t.clientId}::${t.hash}`;
                  const isSel = selected.has(key);
                  return (
                    <tr
                      key={key}
                      onClick={() => setDrawer(t)}
                      className={cn('border-b border-ink-850 cursor-pointer transition-colors group relative', isSel ? 'bg-neon/5' : 'hover:bg-ink-800/40')}
                    >
                      <td className="px-3 py-2.5" onClick={(e) => { e.stopPropagation(); toggle(key); }}>
                        <input type="checkbox" checked={isSel} onChange={() => toggle(key)} className="accent-neon" />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 relative">
                          <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-0.5 h-0 bg-neon group-hover:h-4 transition-all" />
                          <span className="text-ink-100 truncate max-w-[280px]">{t.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><ClientTypeBadge type={clientTypeMap.get(t.clientId) || 'qbittorrent'} /></td>
                      <td className="px-3 py-2.5 text-right stat-num text-ink-300">{formatBytes(t.size)}</td>
                      <td className="px-3 py-2.5"><ProgressBar value={t.progress} showLabel size="sm" color={t.progress === 1 ? 'trans' : 'neon'} /></td>
                      <td className="px-3 py-2.5 text-right stat-num text-neon">{t.downloadSpeed > 0 ? formatSpeed(t.downloadSpeed) : '—'}</td>
                      <td className="px-3 py-2.5 text-right stat-num text-trans">{t.uploadSpeed > 0 ? formatSpeed(t.uploadSpeed) : '—'}</td>
                      <td className="px-3 py-2.5"><TorrentStatusBadge status={t.status} /></td>
                      <td className="px-3 py-2.5 text-right stat-num text-ink-400">{formatRatio(t.ratio)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawer && <TorrentDrawer torrent={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function TorrentDrawer({ torrent, onClose }: { torrent: UnifiedTorrent; onClose: () => void }) {
  const [tab, setTab] = useState<'files' | 'peers' | 'trackers'>('files');
  const { data: details, isLoading } = useQuery({
    queryKey: ['torrent-details', torrent.clientId, torrent.hash],
    queryFn: () => api.getTorrentDetails(torrent.clientId, torrent.hash),
    enabled: !!torrent,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[480px] bg-ink-900 border-l border-ink-800 flex flex-col animate-slide-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-ink-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-medium text-ink-100 break-words">{torrent.name}</h2>
              <p className="text-xs text-ink-500 font-mono mt-1">{torrent.hash}</p>
            </div>
            <button onClick={onClose} className="text-ink-500 hover:text-ink-200"><X className="w-5 h-5" /></button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <Info label="大小" value={formatBytes(torrent.size)} />
            <Info label="进度" value={formatPercent(torrent.progress)} />
            <Info label="↓ 速度" value={formatSpeed(torrent.downloadSpeed)} accent="neon" />
            <Info label="↑ 速度" value={formatSpeed(torrent.uploadSpeed)} accent="trans" />
            <Info label="比率" value={formatRatio(torrent.ratio)} />
            <Info label="ETA" value={formatEta(torrent.eta)} />
          </div>
        </div>

        <div className="flex border-b border-ink-800">
          {(['files', 'peers', 'trackers'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('flex-1 py-2.5 text-xs font-medium transition-colors', tab === t ? 'text-neon border-b border-neon' : 'text-ink-500 hover:text-ink-300')}>
              {t === 'files' ? `文件${details?.files?.length ? ` (${details.files.length})` : ''}` : t === 'peers' ? `Peer${details?.peers?.length ? ` (${details.peers.length})` : ''}` : `Tracker${details?.trackers?.length ? ` (${details.trackers.length})` : ''}`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-ink-500" /></div>
          ) : tab === 'files' ? (
            <FileList files={details?.files || []} />
          ) : tab === 'peers' ? (
            <PeerList peers={details?.peers || []} />
          ) : (
            <TrackerList trackers={details?.trackers || []} />
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, accent }: { label: string; value: string; accent?: 'neon' | 'trans' }) {
  return (
    <div>
      <div className="text-ink-500">{label}</div>
      <div className={cn('stat-num text-ink-100', accent === 'neon' && 'text-neon', accent === 'trans' && 'text-trans')}>{value}</div>
    </div>
  );
}

function FileList({ files }: { files: TorrentFile[] }) {
  return (
    <div className="divide-y divide-ink-850">
      {files.map((f) => (
        <div key={f.index} className="px-5 py-2.5 flex items-center gap-3 text-xs">
          <FileIcon className="w-3.5 h-3.5 text-ink-500 flex-shrink-0" />
          <span className="flex-1 truncate text-ink-200">{f.name}</span>
          <span className="stat-num text-ink-500 w-16 text-right">{formatBytes(f.size)}</span>
          <div className="w-20"><ProgressBar value={f.progress} size="sm" color={f.priority === 0 ? 'vermilion' : 'neon'} /></div>
        </div>
      ))}
    </div>
  );
}

function PeerList({ peers }: { peers: PeerInfo[] }) {
  if (peers.length === 0) return <Empty title="无 Peer" />;
  return (
    <div className="divide-y divide-ink-850">
      {peers.map((p, i) => (
        <div key={i} className="px-5 py-2.5 flex items-center gap-3 text-xs">
          <Users className="w-3.5 h-3.5 text-ink-500" />
          <span className="font-mono text-ink-200 w-32 truncate">{p.address}:{p.port}</span>
          <span className="flex-1 truncate text-ink-400">{p.clientName}</span>
          <span className="stat-num text-neon w-20 text-right">{formatSpeed(p.downloadSpeed)}</span>
          <span className="stat-num text-trans w-20 text-right">{formatSpeed(p.uploadSpeed)}</span>
        </div>
      ))}
    </div>
  );
}

function TrackerList({ trackers }: { trackers: TrackerStat[] }) {
  if (trackers.length === 0) return <Empty title="无 Tracker" />;
  return (
    <div className="divide-y divide-ink-850">
      {trackers.map((t, i) => (
        <div key={i} className="px-5 py-3">
          <div className="flex items-center gap-2">
            <Network className="w-3.5 h-3.5 text-ink-500 flex-shrink-0" />
            <span className="text-xs font-mono text-ink-200 truncate flex-1">{t.url}</span>
            <span className={cn('badge', t.status === 'working' ? 'bg-neon/10 text-neon' : 'bg-amber/10 text-amber')}>{t.status}</span>
          </div>
          <div className="mt-1.5 flex gap-4 text-xs text-ink-500 ml-6">
            <span>做种 <span className="stat-num text-ink-300">{t.seederCount}</span></span>
            <span>下载 <span className="stat-num text-ink-300">{t.leecherCount}</span></span>
            <span>完成 <span className="stat-num text-ink-300">{t.downloadCount}</span></span>
          </div>
        </div>
      ))}
    </div>
  );
}
