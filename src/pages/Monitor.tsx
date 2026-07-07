// 故障监测 - 告警时间线 + 监测规则配置
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, Bell, ShieldCheck, ChevronDown, ChevronRight, Check, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { AlertLevelBadge } from '@/components/ui/Badges';
import { Empty } from '@/components/ui/Empty';
import { formatDateTime, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Alert, MonitorRule } from '@shared/types';

export default function Monitor() {
  const { data: alerts = [], isLoading } = useQuery({ queryKey: ['alerts'], queryFn: api.listAlerts, refetchInterval: 10000 });
  const { data: rules = [] } = useQuery({ queryKey: ['rules'], queryFn: api.listRules });
  const [tab, setTab] = useState<'alerts' | 'rules'>('alerts');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const openCount = alerts.filter((a) => a.status === 'open').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-100">故障监测</h1>
          <p className="text-sm text-ink-500 mt-1">告警时间线 · 自动重试 · 规则配置</p>
        </div>
        <div className="flex items-center gap-2">
          {openCount > 0 && <span className="badge bg-vermilion/15 text-vermilion border border-vermilion/40 animate-pulse">{openCount} 待处理</span>}
        </div>
      </div>

      <div className="flex gap-1 border-b border-ink-800">
        {([['alerts', `告警 (${alerts.length})`], ['rules', '规则']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2', tab === t ? 'text-neon border-neon' : 'text-ink-500 border-transparent hover:text-ink-300')}>{label}</button>
        ))}
      </div>

      {tab === 'alerts' ? (
        <AlertTimeline alerts={alerts} isLoading={isLoading} expanded={expanded} setExpanded={setExpanded} />
      ) : (
        <RulesConfig rules={rules} />
      )}
    </div>
  );
}

function AlertTimeline({ alerts, isLoading, expanded, setExpanded }: { alerts: Alert[]; isLoading: boolean; expanded: Set<string>; setExpanded: (s: Set<string>) => void }) {
  const qc = useQueryClient();
  const ackMut = useMutation({ mutationFn: (id: string) => api.updateAlert(id, 'acknowledged'), onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }) });
  const resolveMut = useMutation({ mutationFn: (id: string) => api.updateAlert(id, 'resolved'), onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }) });

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-ink-500" /></div>;
  if (alerts.length === 0) return <div className="card"><Empty title="无告警记录" description="系统运行正常" icon={<ShieldCheck className="w-12 h-12 text-neon" strokeWidth={1} />} /></div>;

  const toggle = (id: string) => setExpanded(new Set([...expanded, id].filter((x) => expanded.has(id) ? false : true)));

  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const isExp = expanded.has(a.id);
        const colorBar = a.level === 'critical' ? 'bg-vermilion' : a.level === 'error' ? 'bg-vermilion/70' : a.level === 'warning' ? 'bg-amber' : 'bg-trans';
        return (
          <div key={a.id} className="card overflow-hidden">
            <div className="flex">
              <div className={cn('w-1', colorBar)} />
              <div className="flex-1 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className={cn('w-4 h-4 mt-0.5', a.level === 'critical' ? 'text-vermilion' : a.level === 'warning' ? 'text-amber' : 'text-trans')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink-100">{a.event}</span>
                      <AlertLevelBadge level={a.level} />
                      {a.status !== 'open' && <span className="badge bg-ink-800 text-ink-400">{a.status === 'acknowledged' ? '已确认' : '已解决'}</span>}
                    </div>
                    <div className="mt-1 text-xs text-ink-500 flex items-center gap-3">
                      <span className="font-mono">{a.clientName || a.clientId}</span>
                      <span>{timeAgo(a.createdAt)}</span>
                      <span className="text-ink-600">·</span>
                      <span>{formatDateTime(a.createdAt)}</span>
                    </div>
                    {isExp && <p className="mt-2 text-xs text-ink-400 leading-relaxed">{a.detail}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggle(a.id)} className="text-ink-500 hover:text-ink-200 p-1">
                      {isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {a.status === 'open' && (
                  <div className="mt-3 flex items-center gap-2">
                    <button className="btn-ghost text-xs py-1" onClick={() => ackMut.mutate(a.id)} disabled={ackMut.isPending}>
                      <Bell className="w-3 h-3" /> 确认
                    </button>
                    <button className="btn-ghost text-xs py-1 text-neon hover:bg-neon/10" onClick={() => resolveMut.mutate(a.id)} disabled={resolveMut.isPending}>
                      <Check className="w-3 h-3" /> 标记已解决
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RulesConfig({ rules }: { rules: MonitorRule[] }) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<MonitorRule[]>(rules);
  const saveMut = useMutation({
    mutationFn: () => api.updateRules(local.map((r) => ({ id: r.id, enabled: r.enabled, config: r.config }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });

  // 同步外部更新
  if (rules.length && local.length === 0) setLocal(rules);

  const toggle = (id: string) => setLocal(local.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r));

  const ruleIcons: Record<string, typeof Activity> = {
    dead_seed: AlertTriangle,
    tracker_dead: Activity,
    disk_water: ShieldCheck,
    client_reconnect: Bell,
  };

  return (
    <div className="space-y-3">
      {local.map((r) => {
        const Icon = ruleIcons[r.ruleType] || Activity;
        const cfg = r.config as Record<string, number>;
        return (
          <div key={r.id} className="card p-4">
            <div className="flex items-center gap-3">
              <Icon className={cn('w-5 h-5', r.enabled ? 'text-neon' : 'text-ink-600')} strokeWidth={1.5} />
              <div className="flex-1">
                <div className="text-sm font-medium text-ink-100">{r.name}</div>
                <div className="text-xs text-ink-500 font-mono mt-0.5">{r.ruleType}</div>
              </div>
              <button
                onClick={() => toggle(r.id)}
                className={cn('relative w-10 h-5 rounded-full transition-colors', r.enabled ? 'bg-neon/30' : 'bg-ink-700')}
              >
                <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-ink-100 transition-transform', r.enabled ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {Object.entries(cfg).map(([k, v]) => (
                <div key={k}>
                  <label className="block text-xs text-ink-400 mb-1">{k}</label>
                  <input
                    className="input text-xs font-mono"
                    value={v}
                    onChange={(e) => setLocal(local.map((x) => x.id === r.id ? { ...x, config: { ...x.config, [k]: Number(e.target.value) } } : x))}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <button className="btn-primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
        {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {saveMut.isPending ? '保存中...' : '保存规则'}
      </button>
    </div>
  );
}
