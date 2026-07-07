// 添加种子 - 磁链/文件/URL，多客户端分发
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Magnet, FileUp, Link2, Server, Check, ChevronRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { ClientTypeBadge, ClientStatusBadge } from '@/components/ui/Badges';
import { Empty } from '@/components/ui/Empty';
import { cn } from '@/lib/utils';
import type { BatchResult } from '@shared/types';

export default function AddTorrent() {
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: api.listClients });
  const onlineClients = clients.filter((c) => c.status !== 'offline');
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [sourceType, setSourceType] = useState<'magnet' | 'url' | 'file'>('magnet');
  const [magnet, setMagnet] = useState('');
  const [url, setUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileBase64, setFileBase64] = useState('');
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [savePath, setSavePath] = useState('');
  const [paused, setPaused] = useState(false);
  const [category, setCategory] = useState('');
  const [results, setResults] = useState<BatchResult[] | null>(null);

  const addMut = useMutation({
    mutationFn: () => {
      const source =
        sourceType === 'magnet' ? { type: 'magnet' as const, value: magnet } :
        sourceType === 'url' ? { type: 'url' as const, value: url } :
        { type: 'file' as const, filename: fileName, base64: fileBase64 };
      return api.addTorrent({
        source,
        clientIds: Array.from(selectedClients),
        savePath: savePath || undefined,
        paused,
        category: category || undefined,
      });
    },
    onSuccess: (data) => {
      setResults(data);
      qc.invalidateQueries({ queryKey: ['torrents'] });
    },
  });

  const sourceReady = sourceType === 'magnet' ? magnet : sourceType === 'url' ? url : fileBase64;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setFileBase64((reader.result as string).split(',')[1]);
    reader.readAsDataURL(f);
  };

  if (results) {
    const ok = results.filter((r) => r.success).length;
    const fail = results.length - ok;
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="font-display text-2xl font-semibold text-ink-100">分发结果</h1>
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            {fail === 0 ? <CheckCircle2 className="w-8 h-8 text-neon" /> : <AlertCircle className="w-8 h-8 text-amber" />}
            <div>
              <div className="text-lg font-medium text-ink-100">{ok} 成功 · {fail} 失败</div>
              <div className="text-sm text-ink-500">种子已分发到所选客户端</div>
            </div>
          </div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-sm py-2 border-b border-ink-850 last:border-0">
                {r.success ? <Check className="w-4 h-4 text-neon" /> : <AlertCircle className="w-4 h-4 text-vermilion" />}
                <span className="font-mono text-ink-300">{r.clientId}</span>
                {!r.success && <span className="text-xs text-vermilion ml-auto">{r.error}</span>}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-6">
            <Link to="/torrents" className="btn-primary">查看种子列表</Link>
            <button className="btn-ghost" onClick={() => { setResults(null); setStep(0); setSelectedClients(new Set()); }}>继续添加</button>
          </div>
        </div>
      </div>
    );
  }

  if (onlineClients.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-ink-100">添加种子</h1>
        <div className="card"><Empty title="没有在线客户端" description="请先添加并连接客户端" action={<Link to="/clients" className="btn-primary">前往客户端管理</Link>} /></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">添加种子</h1>
        <p className="text-sm text-ink-500 mt-1">支持磁链 / Torrent 文件 / URL · 多客户端并发分发</p>
      </div>

      {/* 步骤指示 */}
      <div className="flex items-center gap-2">
        {['种子源', '选择客户端', '参数'].map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-md text-xs', step === i ? 'bg-neon/10 text-neon border border-neon/30' : 'text-ink-500')}>
              <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono', step === i ? 'bg-neon text-ink-950' : 'bg-ink-800 text-ink-500')}>{i + 1}</span>
              {label}
            </div>
            {i < 2 && <ChevronRight className="w-3.5 h-3.5 text-ink-600" />}
          </div>
        ))}
      </div>

      {/* 步骤 0：种子源 */}
      {step === 0 && (
        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {([['magnet', '磁力链接', Magnet], ['url', 'URL', Link2], ['file', 'Torrent 文件', FileUp]] as const).map(([t, label, Icon]) => (
              <button key={t} onClick={() => setSourceType(t)} className={cn('btn flex-col gap-1.5 py-4', sourceType === t ? 'bg-neon/10 border-neon/40 text-neon' : 'btn-ghost')}>
                <Icon className="w-5 h-5" /><span className="text-xs">{label}</span>
              </button>
            ))}
          </div>

          {sourceType === 'magnet' && (
            <textarea className="input min-h-[96px] font-mono text-xs" placeholder="magnet:?xt=urn:btih:..." value={magnet} onChange={(e) => setMagnet(e.target.value)} />
          )}
          {sourceType === 'url' && (
            <input className="input" placeholder="https://example.com/file.torrent" value={url} onChange={(e) => setUrl(e.target.value)} />
          )}
          {sourceType === 'file' && (
            <label className="block">
              <div className="border-2 border-dashed border-ink-700 rounded-lg p-8 text-center cursor-pointer hover:border-neon/40 transition-colors">
                {fileName ? <p className="text-sm text-neon font-mono">{fileName}</p> : <>
                  <FileUp className="w-8 h-8 text-ink-500 mx-auto mb-2" />
                  <p className="text-sm text-ink-400">点击选择 .torrent 文件</p>
                </>}
              </div>
              <input type="file" accept=".torrent" className="hidden" onChange={onFile} />
            </label>
          )}
          <div className="flex justify-end">
            <button className="btn-primary" disabled={!sourceReady} onClick={() => setStep(1)}>下一步</button>
          </div>
        </div>
      )}

      {/* 步骤 1：选择客户端 */}
      {step === 1 && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-300">选择目标客户端（可多选）</span>
            <span className="badge bg-neon/10 text-neon">已选 {selectedClients.size}</span>
          </div>
          {onlineClients.map((c) => {
            const sel = selectedClients.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => setSelectedClients((prev) => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                className={cn('w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all', sel ? 'bg-neon/5 border-neon/40' : 'border-ink-700 hover:border-ink-600')}
              >
                <div className={cn('w-5 h-5 rounded border flex items-center justify-center', sel ? 'bg-neon border-neon' : 'border-ink-600')}>
                  {sel && <Check className="w-3.5 h-3.5 text-ink-950" />}
                </div>
                <Server className="w-4 h-4 text-ink-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-100 truncate">{c.name}</div>
                  <div className="text-xs text-ink-500 font-mono truncate">{c.url}</div>
                </div>
                <ClientTypeBadge type={c.type} />
                <ClientStatusBadge status={c.status} />
              </button>
            );
          })}
          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(0)}>上一步</button>
            <button className="btn-primary" disabled={selectedClients.size === 0} onClick={() => setStep(2)}>下一步</button>
          </div>
        </div>
      )}

      {/* 步骤 2：参数 */}
      {step === 2 && (
        <div className="card p-5 space-y-4">
          <div>
            <label className="block text-xs text-ink-400 mb-1.5">保存路径（可选）</label>
            <input className="input" placeholder="留空使用客户端默认路径" value={savePath} onChange={(e) => setSavePath(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-ink-400 mb-1.5">分类 / 标签（可选）</label>
            <input className="input" placeholder="如：电影" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} className="accent-neon" />
            <span className="text-sm text-ink-300">添加后暂停</span>
          </label>

          <div className="rounded-md bg-ink-900/60 border border-ink-800 p-3 text-xs text-ink-500 space-y-1">
            <div className="flex justify-between"><span>源类型</span><span className="text-ink-300 font-mono">{sourceType}</span></div>
            <div className="flex justify-between"><span>目标客户端</span><span className="text-ink-300">{selectedClients.size} 个</span></div>
          </div>

          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(1)}>上一步</button>
            <button className="btn-primary" disabled={addMut.isPending} onClick={() => addMut.mutate()}>
              {addMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {addMut.isPending ? '分发中...' : '添加种子'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
