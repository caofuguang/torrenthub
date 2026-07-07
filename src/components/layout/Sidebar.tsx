// 左侧导航栏
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Server, FileDown, Plus, Network, Activity, Settings, Boxes, Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/dashboard', label: '总览', icon: LayoutDashboard },
  { to: '/clients', label: '客户端', icon: Server },
  { to: '/torrents', label: '种子', icon: FileDown },
  { to: '/torrents/add', label: '添加种子', icon: Plus },
  { to: '/trackers', label: 'Tracker', icon: Network },
  { to: '/monitor', label: '监测', icon: Activity },
  { to: '/api', label: 'API', icon: Code2 },
  { to: '/settings', label: '设置', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[72px] bg-ink-900 border-r border-ink-800 flex flex-col items-center py-4 z-40">
      {/* Logo */}
      <div className="mb-6 flex flex-col items-center">
        <div className="w-10 h-10 rounded-lg bg-neon/10 border border-neon/30 flex items-center justify-center shadow-neon-soft">
          <Boxes className="w-5 h-5 text-neon" />
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 flex flex-col gap-1.5 w-full px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={item.label}
            className={({ isActive }) =>
              cn(
                'group relative w-full flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg transition-all duration-150',
                isActive
                  ? 'bg-neon/10 text-neon'
                  : 'text-ink-400 hover:text-ink-100 hover:bg-ink-800',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-neon rounded-r-full shadow-neon-soft" />
                )}
                <item.icon className="w-5 h-5" strokeWidth={1.5} />
                <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* 版本 */}
      <div className="mt-auto text-center">
        <span className="text-[9px] font-mono text-ink-600">v0.1.0</span>
      </div>
    </aside>
  );
}
