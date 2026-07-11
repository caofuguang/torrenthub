// 客户端管理 - 添加/编辑/删除 qBittorrent & Transmission 实例
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Plug, Server, RefreshCw, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { ClientStatusBadge, ClientTypeBadge } from '@/components/ui/Badges';
import { Empty } from '@/components/ui/Empty';
import { formatBytes, timeAgo } from '@/lib/format';
import type { ClientInstance, ClientType } from '@shared/types';

export default function Clients() {
  const { data: clients = [], isLoading } = useQuery({ queryKey: ['clients'], queryFn: api.listClients, structuralSharing: false });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ClientInstance | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-100">客户端管理</h1>
          <p className="text-sm text-ink-500 mt-1">管理 qBittorrent / Transmission 实例</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="w-4 h-4" /> 添加客户端
        </button>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-44 card" />)}</div>
      ) : clients.length === 0 ? (
        <div className="card">
          <Empty
            title="尚未添加任何客户端"
            description="添加 qBittorrent 或 Transmission 实例开始管理种子"
            icon={<Server className="w-12 h-12" strokeWidth={1} />}
            action={<button className="btn-primary" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> 添加客户端</button>}
          />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((c) => <ClientCard key={c.id} client={c} onEdit={() => { setEditing(c); setShowForm(true); }} />)}
        </div>
      )}

      {showForm && (
        <ClientForm
          editing={editing}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function ClientCard({ client, onEdit }: { client: ClientInstance; onEdit: () => void }) {
  const qc = useQueryClient();
  const deleteMut = useMutation({
    mutationFn: () => api.deleteClient(client.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
  const reconnectMut = useMutation({
    mutationFn: () => api.reconnectClient(client.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });

  const typeColor = client.type === 'qbittorrent' ? 'bg-qbit' : 'bg-trans';

  return (
    <div className="card overflow-hidden card-hover group">
      <div className={`h-1 ${typeColor}`} />
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="font-medium text-ink-100 truncate">{client.name}</h3>
            <p className="text-xs text-ink-500 font-mono truncate mt-0.5">{client.url}</p>
          </div>
          <ClientStatusBadge status={client.status} />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <ClientTypeBadge type={client.type} />
          {client.version && <span className="badge bg-ink-800 text-ink-400 font-mono">v{client.version}</span>}
        </div>

        <div className="mt-3 text-xs text-ink-500 space-y-1">
          <div className="flex justify-between">
            <span>用户</span>
            <span className="text-ink-300 font-mono">{client.username || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>最近在线</span>
            <span className="text-ink-300">{client.lastSeen ? timeAgo(client.lastSeen) : '从未'}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button className="btn-ghost flex-1 text-xs py-1.5" onClick={() => reconnectMut.mutate()} disabled={reconnectMut.isPending}>
            <RefreshCw className={`w-3.5 h-3.5 ${reconnectMut.isPending ? 'animate-spin' : ''}`} /> 重连
          </button>
          <button className="btn-ghost text-xs py-1.5 px-2" onClick={onEdit} title="编辑">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn-danger text-xs py-1.5 px-2"
            onClick={() => { if (confirm(`确认删除客户端 "${client.name}"？`)) deleteMut.mutate(); }}
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientForm({ editing, onClose }: { editing: ClientInstance | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: editing?.name || '',
    type: (editing?.type || 'qbittorrent') as ClientType,
    url: editing?.url || '',
    username: editing?.username || '',
    password: editing?.password || '',
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; version?: string; error?: string } | null>(null);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editing) await api.updateClient(editing.id, form);
      else await api.addClient(form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  const testConn = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.testClient(form);
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="card w-full max-w-md p-6 animate-fade-up shadow-2xl bg-gradient-to-b from-ink-800/90 to-ink-850/90" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-medium text-ink-100">{editing ? '编辑客户端' : '添加客户端'}</h2>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-200"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-400 mb-1.5">类型</label>
            <div className="grid grid-cols-2 gap-2">
              {(['qbittorrent', 'transmission'] as ClientType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, type: t })}
                  className={`btn ${form.type === t ? (t === 'qbittorrent' ? 'bg-qbit/15 border-qbit text-qbit' : 'bg-trans/15 border-trans text-trans') : 'btn-ghost'}`}
                >
                  {t === 'qbittorrent' ? 'qBittorrent' : 'Transmission'}
                </button>
              ))}
            </div>
          </div>

          <Field label="名称" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="如：NAS-主下载" />
          <Field label="地址" value={form.url} onChange={(v) => setForm({ ...form, url: v })} placeholder="http://192.168.1.10:8080" />
          <Field label="用户名" value={form.username} onChange={(v) => setForm({ ...form, username: v })} placeholder="admin" />
          <Field label="密码" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="••••••" />

          {testResult && (
            <div className={`text-xs px-3 py-2 rounded border ${testResult.ok ? 'bg-neon/10 border-neon/30 text-neon' : 'bg-vermilion/10 border-vermilion/30 text-vermilion'}`}>
              {testResult.ok ? `连接成功 · 版本 ${testResult.version}` : `连接失败：${testResult.error}`}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button type="button" className="btn-ghost flex-1" onClick={testConn} disabled={testing || !form.url}>
              <Plug className="w-4 h-4" /> {testing ? '测试中...' : '测试连接'}
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name || !form.url}>
              <Check className="w-4 h-4" /> {saveMut.isPending ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-ink-400 mb-1.5">{label}</label>
      <input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
