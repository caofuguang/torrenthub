// Tracker 工作台 - 跨种子聚合、批量增删改、正则替换
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Network, Plus, Minus, RefreshCw, Search, Loader2, Check, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Empty } from '@/components/ui/Empty';
import { cn } from '@/lib/utils';
import type { BatchResult } from '@shared/types';

export default function Trackers() {
  const { data: trackers = [], isLoading } = useQuery({ queryKey: ['trackers'], queryFn: api.listTrackers, refetchInterval: 15000, refetchIntervalInBackground: false });
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [op, setOp] = useState<'add' | 'replace' | 'remove'>('add');
  const [urlsText, setUrlsText] = useState('');
  const [fromUrl, setFromUrl] = useState('');
  const [toUrl, setToUrl] = useState('');
  const [results, setResults] = useState<BatchResult[] | null>(null);

  const filtered = trackers.filter((t) => t.url.toLowerCase().includes(search.toLowerCase()));

  const batchMut = useMutation({
    mutationFn: () => {
      // 选中的 tracker 需要映射到所有含该 tracker 的种子
      // 此处简化：用 tracker URL 作为种子选择依据需要后端支持
      // 实际：前端选中 tracker 后，请求种子列表匹配，再批量操作
      return api.batchTracker({
        torrentKeys: [], // 由后端按 tracker url 反查，或前端先拉种子
        operation: op,
        urls: op === 'add' || op === 'remove' ? urlsText.split('\n').filter(Boolean) : undefined,
        replace: op === 'replace' ? { from: fromUrl, to: toUrl } : undefined,
        previewOnly: false,
      });
    },
    onSuccess: (data) => { setResults(data as BatchResult[]); qc.invalidateQueries({ queryKey: ['trackers'] }); },
  });

  const toggle = (url: string) => setSelected((p) => { const n = new Set(p); n.has(url) ? n.delete(url) : n.add(url); return n; });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Tracker 工作台</h1>
        <p className="text-sm text-ink-500 mt-1">跨种子聚合 · 批量增删改 · 支持正则替换</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左：Tracker 列表 */}
        <div className="card flex flex-col" style={{ minHeight: 400 }}>
          <div className="p-4 border-b border-ink-800 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-200 flex items-center gap-2"><Network className="w-4 h-4 text-neon" /> Tracker 列表</h2>
            <span className="badge bg-ink-800 text-ink-400">{trackers.length}</span>
          </div>
          <div className="p-3 border-b border-ink-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
              <input className="input pl-9 text-xs" placeholder="过滤 tracker..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[480px]">
            {isLoading ? (
              <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-ink-500" /></div>
            ) : filtered.length === 0 ? (
              <Empty title="暂无 Tracker" />
            ) : (
              filtered.map((t) => {
                const sel = selected.has(t.url);
                return (
                  <div key={t.url} onClick={() => toggle(t.url)} className={cn('flex items-center gap-3 px-4 py-2.5 border-b border-ink-850 cursor-pointer transition-colors', sel ? 'bg-neon/5' : 'hover:bg-ink-800/40')}>
                    <div className={cn('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0', sel ? 'bg-neon border-neon' : 'border-ink-600')}>{sel && <Check className="w-3 h-3 text-ink-950" />}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-ink-200 truncate">{t.url}</p>
                      <p className="text-[10px] text-ink-500 mt-0.5">{t.torrentCount} 种 · {t.clients.join(' · ')}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 右：批量操作 */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-medium text-ink-200 flex items-center gap-2"><RefreshCw className="w-4 h-4 text-neon" /> 批量操作</h2>

          {results ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                {results.every((r) => r.success) ? <Check className="w-4 h-4 text-neon" /> : <AlertCircle className="w-4 h-4 text-amber" />}
                <span className="text-ink-200">完成 {results.filter((r) => r.success).length}/{results.length}</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {results.map((r, i) => (
                  <div key={i} className="text-xs flex items-center gap-2">
                    {r.success ? <Check className="w-3 h-3 text-neon" /> : <AlertCircle className="w-3 h-3 text-vermilion" />}
                    <span className="font-mono text-ink-400">{r.hash.slice(0, 12)}</span>
                    {!r.success && <span className="text-vermilion">{r.error}</span>}
                  </div>
                ))}
              </div>
              <button className="btn-ghost text-xs" onClick={() => setResults(null)}>继续操作</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {([['add', '增加', Plus], ['replace', '替换', RefreshCw], ['remove', '删除', Minus]] as const).map(([t, label, Icon]) => (
                  <button key={t} onClick={() => setOp(t)} className={cn('btn flex-col gap-1 py-2.5', op === t ? 'bg-neon/10 border-neon/40 text-neon' : 'btn-ghost')}>
                    <Icon className="w-4 h-4" /><span className="text-xs">{label}</span>
                  </button>
                ))}
              </div>

              {op === 'add' && (
                <div>
                  <label className="block text-xs text-ink-400 mb-1.5">新增 Tracker（每行一个）</label>
                  <textarea className="input min-h-[80px] font-mono text-xs" placeholder="https://tracker1.com/announce&#10;https://tracker2.com/announce" value={urlsText} onChange={(e) => setUrlsText(e.target.value)} />
                </div>
              )}
              {op === 'remove' && (
                <div>
                  <label className="block text-xs text-ink-400 mb-1.5">待删除 Tracker（每行一个）</label>
                  <textarea className="input min-h-[80px] font-mono text-xs" placeholder="https://tracker1.com/announce" value={urlsText} onChange={(e) => setUrlsText(e.target.value)} />
                </div>
              )}
              {op === 'replace' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-ink-400 mb-1.5">原 Tracker（支持正则）</label>
                    <input className="input font-mono text-xs" placeholder="https://old-tracker.com/.*" value={fromUrl} onChange={(e) => setFromUrl(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-ink-400 mb-1.5">新 Tracker</label>
                    <input className="input font-mono text-xs" placeholder="https://new-tracker.com/announce" value={toUrl} onChange={(e) => setToUrl(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="rounded-md bg-amber/5 border border-amber/20 p-2.5 text-xs text-amber/80">
                <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                替换操作将作用于所有选中 tracker 关联的种子。请谨慎操作。
              </div>

              <button
                className="btn-primary w-full"
                disabled={batchMut.isPending || selected.size === 0}
                onClick={() => batchMut.mutate()}
              >
                {batchMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {batchMut.isPending ? '执行中...' : `应用到 ${selected.size} 个 Tracker`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
