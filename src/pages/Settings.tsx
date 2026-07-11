// 设置 - 服务配置、主题、日志查看、数据导入导出
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, Server, Palette, Terminal, Save, Loader2, ScrollText, Download, Upload, Database, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function Settings() {
  const { data: settings = {} } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings, structuralSharing: false });
  const [local, setLocal] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const saveMut = useMutation({
    mutationFn: () => api.updateSettings(local),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  useEffect(() => { if (Object.keys(settings).length) setLocal(settings); }, [settings]);

  // 数据目录
  const { data: dataPathData } = useQuery({
    queryKey: ['dataPath'],
    queryFn: async () => {
      const res = await fetch('/api/settings/data-path');
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '请求失败');
      return json.data;
    },
    retry: false,
    structuralSharing: false,
  });

  // 导入导出状态
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string; backupPath?: string } | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 导出
  const handleExport = () => {
    window.location.href = '/api/settings/export';
  };

  // 导入
  const handleImport = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await fetch('/api/settings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payload.data, overwrite }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || '导入失败');
      }
      setImportResult({ success: true, message: json.message, backupPath: json.backupPath });
    } catch (e) {
      setImportResult({ success: false, message: (e as Error).message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">设置</h1>
        <p className="text-sm text-ink-500 mt-1">服务配置 · 主题 · 实时日志 · 数据管理</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
        {/* 左侧锚点 */}
        <nav className="space-y-1 sticky top-20 self-start">
          {[
            { id: 'service', label: '服务配置', icon: Server },
            { id: 'data', label: '数据管理', icon: Database },
            { id: 'theme', label: '外观', icon: Palette },
            { id: 'logs', label: '日志', icon: Terminal },
          ].map((s) => (
            <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-ink-400 hover:bg-ink-800 hover:text-ink-200 transition-colors">
              <s.icon className="w-4 h-4" /> {s.label}
            </a>
          ))}
        </nav>

        {/* 右侧表单 */}
        <div className="space-y-6">
          {/* 服务配置 */}
          <section id="service" className="card p-5 space-y-4">
            <h2 className="text-sm font-medium text-ink-200 flex items-center gap-2"><Server className="w-4 h-4 text-neon" /> 服务配置</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-ink-400 mb-1.5">监听端口</label>
                <input className="input font-mono" value={local.port || ''} onChange={(e) => setLocal({ ...local, port: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-ink-400 mb-1.5">监听地址</label>
                <input className="input font-mono" value={local.host || ''} onChange={(e) => setLocal({ ...local, host: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-ink-400 mb-1.5">访问 Token</label>
                <input className="input font-mono" placeholder="留空禁用认证" value={local.authToken || ''} onChange={(e) => setLocal({ ...local, authToken: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-ink-400 mb-1.5">主题</label>
                <select className="input" value={local.theme || 'dark'} onChange={(e) => setLocal({ ...local, theme: e.target.value })}>
                  <option value="dark">暗色</option>
                  <option value="light">亮色</option>
                  <option value="system">跟随系统</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={local.openBrowserOnStart === 'true'} onChange={(e) => setLocal({ ...local, openBrowserOnStart: e.target.checked ? 'true' : 'false' })} className="accent-neon" />
              <span className="text-ink-300">启动时自动打开浏览器</span>
            </label>
            <button className="btn-primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saveMut.isPending ? '保存中...' : '保存设置'}
            </button>
          </section>

          {/* 数据管理 */}
          <section id="data" className="card p-5 space-y-4">
            <h2 className="text-sm font-medium text-ink-200 flex items-center gap-2"><Database className="w-4 h-4 text-neon" /> 数据管理</h2>

            <div className="bg-ink-950 border border-ink-800 rounded-md p-3 font-mono text-xs space-y-1">
              <div className="flex justify-between"><span className="text-ink-500">配置目录</span><span className="text-ink-200">{dataPathData?.dataDir || '加载中...'}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">数据文件</span><span className="text-ink-200">{dataPathData?.dbPath || '加载中...'}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button className="flex items-center justify-center gap-2 p-3 rounded-lg border border-ink-700 hover:border-neon/40 hover:bg-neon/5 transition-colors text-sm" onClick={handleExport}>
                <Download className="w-4 h-4 text-neon" /> 导出数据
              </button>
              <button className="flex items-center justify-center gap-2 p-3 rounded-lg border border-ink-700 hover:border-neon/40 hover:bg-neon/5 transition-colors text-sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 text-neon" /> 导入数据
              </button>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="accent-vermilion" />
              <span className="text-ink-300">覆盖现有数据（默认仅合并不冲突项）</span>
            </label>

            {importResult && (
              <div className={cn('p-3 rounded-md border text-sm', importResult.success ? 'border-emerald/40 bg-emerald/5' : 'border-vermilion/40 bg-vermilion/5')}>
                {importResult.success ? (
                  <>
                    <div className="text-emerald">{importResult.message}</div>
                    <div className="text-xs text-ink-400 mt-1 font-mono">备份文件: {importResult.backupPath}</div>
                  </>
                ) : (
                  <div className="text-vermilion">导入失败: {importResult.message}</div>
                )}
              </div>
            )}

            {importing && (
              <div className="flex items-center gap-2 text-sm text-ink-400">
                <Loader2 className="w-4 h-4 animate-spin" /> 导入中...
              </div>
            )}

            <div className="text-xs text-ink-500 space-y-1">
              <div><span className="text-ink-400">• 导出:</span> 下载包含客户端、种子配置、告警、规则、设置的完整备份 JSON</div>
              <div><span className="text-ink-400">• 导入:</span> 上传之前导出的备份文件，支持合并或覆盖</div>
              <div><span className="text-ink-400">• 备份:</span> 导入前会自动备份当前数据至 {dataPathData?.dbPath?.replace('config.json', 'config.json.bak') || 'config.json.bak'}</div>
            </div>
          </section>

          {/* 主题 */}
          <section id="theme" className="card p-5 space-y-3">
            <h2 className="text-sm font-medium text-ink-200 flex items-center gap-2"><Palette className="w-4 h-4 text-neon" /> 外观</h2>
            <div className="grid grid-cols-3 gap-3">
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button key={t} onClick={() => setLocal({ ...local, theme: t })} className={cn('p-4 rounded-lg border text-center transition-colors', local.theme === t ? 'border-neon/40 bg-neon/5' : 'border-ink-700 hover:border-ink-600')}>
                  <div className={cn('w-full h-12 rounded mb-2', t === 'dark' ? 'bg-ink-900' : t === 'light' ? 'bg-ink-100' : 'bg-gradient-to-r from-ink-900 to-ink-100')} />
                  <span className="text-xs text-ink-300">{t === 'dark' ? '暗色' : t === 'light' ? '亮色' : '跟随系统'}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 日志 */}
          <section id="logs" className="card p-5 space-y-3">
            <h2 className="text-sm font-medium text-ink-200 flex items-center gap-2"><Terminal className="w-4 h-4 text-neon" /> 实时日志</h2>
            <LogViewer />
          </section>

          {/* 关于 */}
          <section className="card p-5">
            <h2 className="text-sm font-medium text-ink-200 flex items-center gap-2 mb-3"><SettingsIcon className="w-4 h-4 text-neon" /> 关于</h2>
            <div className="text-xs text-ink-500 space-y-1 font-mono">
              <div className="flex justify-between"><span>版本</span><span className="text-ink-300">v0.1.0</span></div>
              <div className="flex justify-between"><span>配置目录</span><span className="text-ink-300">{dataPathData?.dataDir || '加载中...'}</span></div>
              <div className="flex justify-between"><span>WebSocket</span><span className="text-neon">/ws</span></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function LogViewer() {
  const [logs, setLogs] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource('/api/logs');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (Array.isArray(data)) {
          setLogs(data.map((d) => `[${d.time}] ${d.level.toUpperCase()} ${d.msg}`));
        } else {
          setLogs((prev) => [...prev.slice(-100), `[${data.time}] ${data.level.toUpperCase()} ${data.msg}`]);
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);

  return (
    <div ref={ref} className="bg-ink-950 border border-ink-800 rounded-md p-3 h-64 overflow-y-auto font-mono text-xs space-y-0.5">
      {logs.length === 0 ? (
        <div className="text-ink-600 flex items-center gap-2"><ScrollText className="w-3.5 h-3.5" /> 等待日志...</div>
      ) : (
        logs.map((line, i) => (
          <div key={i} className={cn('whitespace-pre-wrap break-all', line.includes('ERROR') ? 'text-vermilion' : line.includes('WARN') ? 'text-amber' : line.includes('INFO') ? 'text-ink-300' : 'text-ink-500')}>{line}</div>
        ))
      )}
    </div>
  );
}
